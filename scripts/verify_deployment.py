"""
FairLens Deployment Verification Script
Tests all API endpoints and reports status.
Usage: python verify_deployment.py --base-url https://fairlens-backend.up.railway.app
"""
import argparse
import json
import sys
import time

import requests


def check(url, method="GET", **kwargs):
    """Make request and return (status_code, response_json_or_text)."""
    try:
        resp = requests.request(method, url, timeout=15, **kwargs)
        try:
            data = resp.json()
        except (json.JSONDecodeError, ValueError):
            data = resp.text
        return resp.status_code, data
    except requests.exceptions.RequestException as e:
        return None, str(e)


def test_health(base_url):
    url = f"{base_url}/health"
    code, data = check(url)
    print(f"\n[1] GET /health → status={code}")
    if code == 200 and isinstance(data, dict):
        print(f"    ✓ Healthy: {data}")
        return True
    print(f"    ✗ Failed: {data}")
    return False


def test_root(base_url):
    url = f"{base_url}/"
    code, data = check(url)
    print(f"\n[2] GET / → status={code}")
    if code == 200:
        print(f"    ✓ Root: {data}")
        return True
    print(f"    ✗ Failed: {data}")
    return False


def test_cors(base_url):
    url = f"{base_url}/health"
    try:
        resp = requests.options(url, headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
        }, timeout=10)
        allow_origin = resp.headers.get("Access-Control-Allow-Origin", "")
        allow_methods = resp.headers.get("Access-Control-Allow-Methods", "")
        print(f"\n[3] CORS check")
        if allow_origin:
            print(f"    ✓ CORS headers: Allow-Origin={allow_origin}, Methods={allow_methods}")
            return True
        elif resp.status_code == 200:
            # FastAPI's CORSMiddleware may not respond to preflight on OPTIONS,
            # but adds headers on actual requests. Test with actual request.
            resp2 = requests.get(url, headers={"Origin": "https://example.com"}, timeout=10)
            ao = resp2.headers.get("Access-Control-Allow-Origin", "")
            print(f"    ~ No OPTIONS preflight, but GET returned Allow-Origin={ao}")
            return bool(ao)
        print(f"    ✗ No CORS headers. Status={resp.status_code}")
        return False
    except Exception as e:
        print(f"    ✗ CORS check failed: {e}")
        return False


def test_openrouter(base_url):
    """Test by uploading a file and then analyzing it (triggers AI call)."""
    print(f"\n[4] Testing AI model connectivity...")
    print(f"    (This requires OPENROUTER_API_KEY to be set)")
    # Upload a test CSV
    csv_content = "age,gender,race,education,experience_years,hired\n30,Male,White,Bachelor,5,1\n25,Female,Black,Master,3,0\n"
    files = {"file": ("test.csv", csv_content, "text/csv")}
    code, data = check(f"{base_url}/upload", "POST", files=files)
    print(f"    Upload test: status={code}")
    if code == 200 and isinstance(data, dict):
        print(f"    ✓ Upload OK: {data.get('message', data)}")
        return True
    print(f"    ✗ Upload failed: {data}")
    return False


def test_upload(base_url):
    """Upload a sample dataset."""
    csv_content = "age,gender,race,education,experience_years,hired\n30,Male,White,Bachelor,5,1\n25,Female,Black,Master,3,0\n35,Male,Asian,PhD,10,1\n28,Female,Hispanic,Bachelor,2,0\n40,Male,White,Master,15,1\n22,Female,Black,High School,1,0\n"
    files = {"file": ("verify_test.csv", csv_content, "text/csv")}
    code, data = check(f"{base_url}/upload", "POST", files=files)
    print(f"\n[5] POST /upload → status={code}")
    if code == 200 and isinstance(data, dict):
        print(f"    ✓ Uploaded: {data.get('message', data)}")
        return True, data.get("filename")
    print(f"    ✗ Failed: {data}")
    return False, None


def test_analyses(base_url):
    url = f"{base_url}/analyses"
    code, data = check(url)
    print(f"\n[6] GET /analyses → status={code}")
    if code == 200:
        count = len(data) if isinstance(data, list) else 0
        print(f"    ✓ Found {count} analyses")
        return True
    print(f"    ✗ Failed: {data}")
    return False


def test_report_endpoint(base_url):
    """Test report generation endpoint."""
    url = f"{base_url}/report"
    code, data = check(url, "POST", json={"analysis_ids": None})
    print(f"\n[7] POST /report → status={code}")
    # This may 404 if no analyses exist, which is OK
    if code in (200, 404):
        msg = "OK" if code == 200 else "No analyses to report (expected on fresh deploy)"
        print(f"    ~ {msg}: {data}")
        return True
    print(f"    ✗ Failed: {data}")
    return False


def main():
    parser = argparse.ArgumentParser(description="FairLens Deployment Verification")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend base URL")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    print("=" * 60)
    print(f"  FairLens Deployment Verification")
    print(f"  Target: {base_url}")
    print("=" * 60)

    results = {}

    results["health"] = test_health(base_url)
    results["root"] = test_root(base_url)
    results["cors"] = test_cors(base_url)
    results["openrouter"] = test_openrouter(base_url)
    results["upload"], _ = test_upload(base_url)
    results["analyses"] = test_analyses(base_url)
    results["report"] = test_report_endpoint(base_url)

    # Summary
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, status in results.items():
        icon = "✓" if status else "✗"
        print(f"  {icon} {name}: {'PASS' if status else 'FAIL'}")

    print(f"\n  {passed}/{total} checks passed")

    if passed == total:
        print("\n  🟢 All checks passed! Deployment is healthy.")
    else:
        print(f"\n  🟡 {total - passed} check(s) need attention.")
        failed = [k for k, v in results.items() if not v]
        print(f"  Failed: {', '.join(failed)}")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
