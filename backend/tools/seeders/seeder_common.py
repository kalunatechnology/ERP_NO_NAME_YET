from __future__ import annotations

import json
import logging
import os
import re
import tempfile
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence
from urllib.parse import urljoin
from uuid import UUID

import requests


logger = logging.getLogger("ERPSeeder")


class SeederError(RuntimeError):
    """Kesalahan yang menghentikan satu tahap seeding."""


class SeederClient:
    """
    HTTP client untuk seeding ERP berdasarkan OpenAPI schema live.

    Fitur utama:
    - JWT login dan refresh;
    - validasi endpoint + payload terhadap OpenAPI;
    - idempotent upsert berbasis state dan exact-match;
    - lifecycle test: create/reuse, pagination, search, ordering,
      retrieve, patch, dan delete;
    - state UUID tersimpan secara atomik.
    """

    def __init__(
        self,
        *,
        base_url: str,
        email: str,
        password: str,
        state_file: str | Path,
        timeout: int = 30,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.state_file = Path(state_file).expanduser().resolve()
        self.timeout = timeout

        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.schema: Dict[str, Any] = {}
        self.state: Dict[str, Any] = self._load_state()

    # ------------------------------------------------------------------
    # Bootstrap, auth, schema
    # ------------------------------------------------------------------

    def bootstrap(self) -> None:
        self.authenticate()
        self.load_openapi_schema()

    def authenticate(self) -> None:
        response = self.session.post(
            self.url("/api/v1/auth/token/"),
            json={"email": self.email, "password": self.password},
            timeout=self.timeout,
        )
        data = self._parse_response(response)

        if response.status_code != 200:
            raise SeederError(
                f"Autentikasi gagal ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        self.access_token = data.get("access") if isinstance(data, dict) else None
        self.refresh_token = data.get("refresh") if isinstance(data, dict) else None

        if not self.access_token:
            raise SeederError("Response login tidak memiliki access token.")

        self.session.headers.update(
            {"Authorization": f"Bearer {self.access_token}"}
        )
        logger.info("Autentikasi berhasil sebagai %s.", self.email)

    def refresh_access_token(self) -> None:
        if not self.refresh_token:
            raise SeederError("Refresh token tidak tersedia.")

        response = requests.post(
            self.url("/api/v1/auth/token/refresh/"),
            json={"refresh": self.refresh_token},
            headers={"Accept": "application/json"},
            timeout=self.timeout,
        )
        data = self._parse_response(response)

        if response.status_code != 200 or not isinstance(data, dict):
            raise SeederError(
                f"Refresh token gagal ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        access = data.get("access")
        if not access:
            raise SeederError("Response refresh tidak memiliki access token.")

        self.access_token = access
        self.refresh_token = data.get("refresh") or self.refresh_token
        self.session.headers.update(
            {"Authorization": f"Bearer {self.access_token}"}
        )

    def load_openapi_schema(self) -> None:
        response = self.session.get(
            self.url("/api/schema/?format=json"),
            timeout=self.timeout,
        )
        data = self._parse_response(response)

        if response.status_code != 200 or not isinstance(data, dict):
            raise SeederError(
                f"OpenAPI schema gagal dimuat ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        if not isinstance(data.get("paths"), dict):
            raise SeederError("OpenAPI schema tidak memiliki object 'paths'.")

        self.schema = data
        logger.info(
            "OpenAPI schema dimuat: %s path, %s component.",
            len(data.get("paths", {})),
            len(data.get("components", {}).get("schemas", {})),
        )

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    def _load_state(self) -> Dict[str, Any]:
        if not self.state_file.exists():
            return {
                "meta": {
                    "base_url": self.base_url,
                    "created_at": datetime.now().isoformat(),
                },
                "created_records": {},
                "reports": {},
            }

        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise SeederError(
                f"State file tidak dapat dibaca: {self.state_file}: {exc}"
            ) from exc

        if not isinstance(data, dict):
            raise SeederError("State file harus berisi JSON object.")

        data.setdefault("created_records", {})
        data.setdefault("reports", {})
        return data

    def save_state(self) -> None:
        self.state.setdefault("meta", {})
        self.state["meta"].update(
            {
                "base_url": self.base_url,
                "updated_at": datetime.now().isoformat(),
            }
        )

        self.state_file.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            delete=False,
            dir=self.state_file.parent,
            suffix=".tmp",
        ) as handle:
            json.dump(self.state, handle, ensure_ascii=False, indent=2)
            temp_name = handle.name

        Path(temp_name).replace(self.state_file)
        logger.info("State tersimpan: %s", self.state_file)

    def state_mapping(self, path: Sequence[str]) -> Dict[str, str]:
        current: Dict[str, Any] = self.state
        for key in path:
            value = current.setdefault(key, {})
            if not isinstance(value, dict):
                raise SeederError(
                    f"State path {'/'.join(path)} bukan object JSON."
                )
            current = value
        return current  # type: ignore[return-value]

    def require_state_id(self, path: Sequence[str], label: str) -> str:
        current: Any = self.state
        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)

        if not current:
            raise SeederError(
                f"Dependency '{label}' tidak ditemukan pada state path "
                f"{'.'.join(path)}. Jalankan tahap sebelumnya."
            )
        return str(current)

    # ------------------------------------------------------------------
    # OpenAPI inspection and payload validation
    # ------------------------------------------------------------------

    def assert_operation(self, endpoint: str, method: str) -> Dict[str, Any]:
        path_item = self.schema.get("paths", {}).get(endpoint)
        if not isinstance(path_item, dict):
            raise SeederError(
                f"Endpoint tidak ada pada Swagger/OpenAPI: {endpoint}"
            )

        operation = path_item.get(method.lower())
        if not isinstance(operation, dict):
            raise SeederError(
                f"Method {method.upper()} tidak tersedia untuk {endpoint}"
            )
        return operation

    def match_schema_endpoint(self, endpoint: str) -> Optional[str]:
        """Temukan path template OpenAPI untuk URL konkret berisi UUID."""
        paths = self.schema.get("paths", {})
        if endpoint in paths:
            return endpoint

        endpoint_path = endpoint.split("?", 1)[0]
        for template in paths:
            pattern = re.sub(r"\\{[^/]+\\}", r"[^/]+", template)
            if re.fullmatch(pattern, endpoint_path):
                return template
        return None

    def request_schema(self, endpoint: str, method: str) -> Dict[str, Any]:
        operation = self.assert_operation(endpoint, method)
        content = operation.get("requestBody", {}).get("content", {})

        media = (
            content.get("application/json")
            or content.get("application/x-www-form-urlencoded")
            or content.get("multipart/form-data")
            or {}
        )
        schema = media.get("schema", {})
        return self._resolve_schema(schema)

    def validate_payload(
        self,
        endpoint: str,
        method: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        clean = {
            key: value
            for key, value in payload.items()
            if not key.startswith("_")
        }
        request_schema = self.request_schema(endpoint, method)
        properties = request_schema.get("properties", {})
        required = set(request_schema.get("required", []))

        unknown = sorted(set(clean) - set(properties))
        if unknown:
            raise SeederError(
                f"{method.upper()} {endpoint}: field tidak ada pada Swagger: "
                f"{', '.join(unknown)}"
            )

        missing = sorted(
            field
            for field in required
            if field not in clean or clean[field] in (None, "")
        )
        if missing:
            raise SeederError(
                f"{method.upper()} {endpoint}: field wajib belum diisi: "
                f"{', '.join(missing)}"
            )

        for field, value in clean.items():
            self._validate_value(
                endpoint=endpoint,
                field=field,
                value=value,
                schema=self._resolve_schema(properties.get(field, {})),
            )

        return clean

    def _validate_value(
        self,
        *,
        endpoint: str,
        field: str,
        value: Any,
        schema: Mapping[str, Any],
    ) -> None:
        if value is None:
            if schema.get("nullable"):
                return
            return

        enum = schema.get("enum")
        if enum and value not in enum:
            raise SeederError(
                f"{endpoint}: nilai {field}={value!r} tidak termasuk enum {enum}."
            )

        value_type = schema.get("type")
        if value_type == "string" and not isinstance(value, str):
            raise SeederError(f"{endpoint}: field {field} harus string.")
        if value_type == "boolean" and not isinstance(value, bool):
            raise SeederError(f"{endpoint}: field {field} harus boolean.")
        if value_type == "integer" and (
            not isinstance(value, int) or isinstance(value, bool)
        ):
            raise SeederError(f"{endpoint}: field {field} harus integer.")
        if value_type == "array" and not isinstance(value, list):
            raise SeederError(f"{endpoint}: field {field} harus array.")
        if value_type == "object" and not isinstance(value, dict):
            raise SeederError(f"{endpoint}: field {field} harus object.")

        max_length = schema.get("maxLength")
        if max_length and isinstance(value, str) and len(value) > max_length:
            raise SeederError(
                f"{endpoint}: field {field} melebihi maxLength {max_length}."
            )

        fmt = schema.get("format")
        if fmt == "uuid" and value:
            try:
                UUID(str(value))
            except ValueError as exc:
                raise SeederError(
                    f"{endpoint}: field {field} bukan UUID valid: {value}"
                ) from exc

        if fmt == "date" and value:
            try:
                date.fromisoformat(str(value))
            except ValueError as exc:
                raise SeederError(
                    f"{endpoint}: field {field} bukan tanggal ISO YYYY-MM-DD."
                ) from exc

        if fmt == "date-time" and value:
            try:
                datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError as exc:
                raise SeederError(
                    f"{endpoint}: field {field} bukan ISO date-time."
                ) from exc

        if fmt == "decimal" and value not in (None, ""):
            try:
                Decimal(str(value))
            except InvalidOperation as exc:
                raise SeederError(
                    f"{endpoint}: field {field} bukan decimal valid."
                ) from exc

    def _resolve_schema(
        self,
        value: Any,
        seen: Optional[set[str]] = None,
    ) -> Dict[str, Any]:
        if not isinstance(value, dict):
            return {}

        seen = set() if seen is None else set(seen)

        ref = value.get("$ref")
        if ref:
            if ref in seen:
                return {}
            seen.add(ref)
            target = self._resolve_pointer(ref)
            return self._resolve_schema(target, seen)

        if isinstance(value.get("allOf"), list):
            merged: Dict[str, Any] = {
                "type": "object",
                "properties": {},
                "required": [],
            }
            for part in value["allOf"]:
                resolved = self._resolve_schema(part, seen)
                merged["properties"].update(resolved.get("properties", {}))
                merged["required"].extend(resolved.get("required", []))
                for key, item in resolved.items():
                    if key not in {"properties", "required"}:
                        merged[key] = item

            merged["required"] = list(dict.fromkeys(merged["required"]))
            for key, item in value.items():
                if key != "allOf":
                    merged[key] = item
            return merged

        for composition in ("oneOf", "anyOf"):
            options = value.get(composition)
            if isinstance(options, list) and options:
                non_null = next(
                    (
                        option
                        for option in options
                        if option.get("type") != "null"
                    ),
                    options[0],
                )
                merged = dict(value)
                merged.pop(composition, None)
                merged.update(self._resolve_schema(non_null, seen))
                if any(option.get("type") == "null" for option in options):
                    merged["nullable"] = True
                return merged

        return deepcopy(value)

    def _resolve_pointer(self, ref: str) -> Any:
        if not ref.startswith("#/"):
            return {}
        current: Any = self.schema
        for part in ref[2:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            if not isinstance(current, dict):
                return {}
            current = current.get(part)
        return current

    # ------------------------------------------------------------------
    # HTTP
    # ------------------------------------------------------------------

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        payload: Optional[Mapping[str, Any]] = None,
        params: Optional[Mapping[str, Any]] = None,
        company_id: Optional[str] = None,
        expected: Iterable[int] = (200,),
        validate_schema: bool = True,
        use_auth: bool = True,
        retry_auth: bool = True,
    ) -> tuple[requests.Response, Any]:
        method = method.upper()

        schema_endpoint = self.match_schema_endpoint(endpoint)
        if endpoint.startswith("/api/") and schema_endpoint:
            self.assert_operation(schema_endpoint, method)

        clean_payload: Optional[Dict[str, Any]] = None
        if payload is not None:
            clean_payload = (
                self.validate_payload(schema_endpoint, method, payload)
                if validate_schema and schema_endpoint
                else {
                    key: value
                    for key, value in payload.items()
                    if not key.startswith("_")
                }
            )

        headers: Dict[str, str] = {}
        if company_id:
            headers["X-Company-ID"] = company_id

        if not use_auth:
            headers["Authorization"] = ""

        response = self.session.request(
            method,
            self.url(endpoint),
            json=clean_payload,
            params=params,
            headers=headers,
            timeout=self.timeout,
        )

        if (
            response.status_code == 401
            and retry_auth
            and use_auth
            and self.refresh_token
        ):
            self.refresh_access_token()
            return self.request(
                method,
                endpoint,
                payload=payload,
                params=params,
                company_id=company_id,
                expected=expected,
                validate_schema=validate_schema,
                use_auth=use_auth,
                retry_auth=False,
            )

        data = self._parse_response(response)
        expected_set = set(expected)

        if response.status_code not in expected_set:
            raise SeederError(
                f"{method} {endpoint} gagal ({response.status_code}); "
                f"expected {sorted(expected_set)}: {self._error_message(data)}"
            )

        return response, data

    def _parse_response(self, response: requests.Response) -> Any:
        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return response.text

    @staticmethod
    def _error_message(data: Any) -> str:
        if data is None:
            return "(empty response)"
        if isinstance(data, str):
            return data[:500]
        if isinstance(data, dict):
            if data.get("detail"):
                return str(data["detail"])
            return json.dumps(data, ensure_ascii=False)[:1000]
        return str(data)[:500]

    def url(self, endpoint: str) -> str:
        return urljoin(f"{self.base_url}/", endpoint.lstrip("/"))

    # ------------------------------------------------------------------
    # Generic lifecycle
    # ------------------------------------------------------------------

    def seed_resource(
        self,
        *,
        stage_name: str,
        state_path: Sequence[str],
        endpoint: str,
        items: Sequence[Mapping[str, Any]],
        match_fields: Sequence[str],
        patch_payload: Optional[Mapping[str, Any]],
        delete_key: Optional[str],
        search_term: str,
        company_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.assert_operation(endpoint, "GET")
        self.assert_operation(endpoint, "POST")

        records = self.state_mapping(state_path)
        report: Dict[str, Any] = {
            "endpoint": endpoint,
            "records": {},
            "actions": {},
            "tests": {
                "upsert": "FAIL",
                "pagination": "FAIL",
                "search": "FAIL",
                "ordering": "FAIL",
                "retrieve": "FAIL",
                "patch": "SKIP",
                "delete": "SKIP",
            },
            "errors": [],
        }

        logger.info("Seeding %s melalui %s", stage_name, endpoint)

        successful = 0
        for raw_item in items:
            key = str(raw_item.get("_key") or "").strip()
            if not key:
                raise SeederError(
                    f"{stage_name}: setiap item harus memiliki _key lokal."
                )

            payload = self.validate_payload(endpoint, "POST", raw_item)

            try:
                record_id, action = self._ensure_record(
                    endpoint=endpoint,
                    key=key,
                    payload=payload,
                    match_fields=match_fields,
                    known_id=records.get(key),
                    company_id=company_id,
                )
                records[key] = record_id
                report["records"][key] = record_id
                report["actions"][key] = action
                successful += 1
                logger.info("[%s] %s -> %s", action, key, record_id)
            except SeederError as exc:
                report["errors"].append(str(exc))
                logger.error("%s", exc)

        report["tests"]["upsert"] = (
            "PASS" if successful == len(items) else "FAIL"
        )

        # Query parameter tests documented in Swagger.
        try:
            _, page_data = self.request(
                "GET",
                endpoint,
                params={"page": 1, "page_size": 2},
                company_id=company_id,
                expected=(200,),
            )
            page_items = self._list_items(page_data)
            report["tests"]["pagination"] = (
                "PASS" if len(page_items) <= 2 else "FAIL"
            )
        except SeederError as exc:
            report["errors"].append(str(exc))

        try:
            self.request(
                "GET",
                endpoint,
                params={"search": search_term},
                company_id=company_id,
                expected=(200,),
            )
            report["tests"]["search"] = "PASS"
        except SeederError as exc:
            report["errors"].append(str(exc))

        try:
            self.request(
                "GET",
                endpoint,
                params={"ordering": "id"},
                company_id=company_id,
                expected=(200,),
            )
            self.request(
                "GET",
                endpoint,
                params={"ordering": "-id"},
                company_id=company_id,
                expected=(200,),
            )
            report["tests"]["ordering"] = "PASS"
        except SeederError as exc:
            report["errors"].append(str(exc))

        persistent_keys = [
            str(item["_key"])
            for item in items
            if str(item["_key"]) != delete_key
            and records.get(str(item["_key"]))
        ]
        target_key = persistent_keys[0] if persistent_keys else None
        target_id = records.get(target_key) if target_key else None

        if target_id:
            try:
                self.request(
                    "GET",
                    self.detail_endpoint(endpoint, target_id),
                    company_id=company_id,
                    expected=(200,),
                )
                report["tests"]["retrieve"] = "PASS"
            except SeederError as exc:
                report["errors"].append(str(exc))

        if target_id and patch_payload is not None:
            try:
                self.request(
                    "PATCH",
                    self.detail_endpoint(endpoint, target_id),
                    payload=patch_payload,
                    company_id=company_id,
                    expected=(200,),
                )
                report["tests"]["patch"] = "PASS"
            except SeederError as exc:
                report["tests"]["patch"] = "FAIL"
                report["errors"].append(str(exc))

        if delete_key:
            delete_id = records.get(delete_key)
            if delete_id:
                try:
                    self.request(
                        "DELETE",
                        self.detail_endpoint(endpoint, delete_id),
                        company_id=company_id,
                        expected=(200, 204),
                    )
                    report["tests"]["delete"] = "PASS"
                except SeederError as exc:
                    report["tests"]["delete"] = "FAIL"
                    report["errors"].append(str(exc))
            else:
                report["tests"]["delete"] = "FAIL"
                report["errors"].append(
                    f"Delete key {delete_key} tidak memiliki UUID."
                )

        report["success"] = all(
            value in {"PASS", "SKIP"}
            for value in report["tests"].values()
        ) and not report["errors"]

        reports = self.state_mapping(("reports",))
        reports[stage_name] = report
        self.save_state()

        logger.info(
            "Hasil %s: %s",
            stage_name,
            "PASS" if report["success"] else "FAIL",
        )
        return report

    def _ensure_record(
        self,
        *,
        endpoint: str,
        key: str,
        payload: Mapping[str, Any],
        match_fields: Sequence[str],
        known_id: Optional[str],
        company_id: Optional[str],
    ) -> tuple[str, str]:
        if known_id:
            response = self.session.get(
                self.url(self.detail_endpoint(endpoint, known_id)),
                headers=(
                    {"X-Company-ID": company_id}
                    if company_id
                    else None
                ),
                timeout=self.timeout,
            )
            if response.status_code == 200:
                self.request(
                    "PATCH",
                    self.detail_endpoint(endpoint, known_id),
                    payload=payload,
                    company_id=company_id,
                    expected=(200,),
                )
                return str(known_id), "UPDATED"
            if response.status_code not in {404, 410}:
                data = self._parse_response(response)
                raise SeederError(
                    f"GET existing {key} gagal ({response.status_code}): "
                    f"{self._error_message(data)}"
                )

        matched_id = self._find_exact_match(
            endpoint=endpoint,
            payload=payload,
            match_fields=match_fields,
            company_id=company_id,
        )
        if matched_id:
            self.request(
                "PATCH",
                self.detail_endpoint(endpoint, matched_id),
                payload=payload,
                company_id=company_id,
                expected=(200,),
            )
            return matched_id, "REUSED"

        try:
            _, data = self.request(
                "POST",
                endpoint,
                payload=payload,
                company_id=company_id,
                expected=(200, 201),
            )
        except SeederError:
            # Duplicate validation can occur if the local state was removed.
            matched_id = self._find_exact_match(
                endpoint=endpoint,
                payload=payload,
                match_fields=match_fields,
                company_id=company_id,
            )
            if matched_id:
                return matched_id, "REUSED"
            raise

        if not isinstance(data, dict) or not data.get("id"):
            raise SeederError(
                f"POST {endpoint} untuk {key} tidak mengembalikan field id."
            )
        return str(data["id"]), "CREATED"

    def _find_exact_match(
        self,
        *,
        endpoint: str,
        payload: Mapping[str, Any],
        match_fields: Sequence[str],
        company_id: Optional[str],
    ) -> Optional[str]:
        if not match_fields:
            return None

        params: Dict[str, Any] = {"page": 1, "page_size": 100}
        first_value = payload.get(match_fields[0])
        if first_value not in (None, "") and not self._looks_like_uuid(first_value):
            params["search"] = first_value

        _, data = self.request(
            "GET",
            endpoint,
            params=params,
            company_id=company_id,
            expected=(200,),
        )

        for item in self._list_items(data):
            if not isinstance(item, dict) or not item.get("id"):
                continue
            if all(
                self._equivalent(item.get(field), payload.get(field))
                for field in match_fields
            ):
                return str(item["id"])
        return None

    @staticmethod
    def _looks_like_uuid(value: Any) -> bool:
        try:
            UUID(str(value))
            return True
        except (ValueError, TypeError, AttributeError):
            return False

    @staticmethod
    def _equivalent(left: Any, right: Any) -> bool:
        if left is None and right in (None, ""):
            return True
        if isinstance(left, bool) or isinstance(right, bool):
            return left is right

        try:
            return Decimal(str(left)) == Decimal(str(right))
        except (InvalidOperation, TypeError, ValueError):
            return str(left) == str(right)

    @staticmethod
    def _list_items(data: Any) -> list[Dict[str, Any]]:
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict):
            results = data.get("results")
            if isinstance(results, list):
                return [
                    item
                    for item in results
                    if isinstance(item, dict)
                ]
        return []

    @staticmethod
    def detail_endpoint(endpoint: str, record_id: str) -> str:
        return f"{endpoint.rstrip('/')}/{record_id}/"

    # ------------------------------------------------------------------
    # Additional checks
    # ------------------------------------------------------------------

    def verify_user_login(
        self,
        *,
        email: str,
        password: str,
        should_succeed: bool,
    ) -> bool:
        response = requests.post(
            self.url("/api/v1/auth/token/"),
            json={"email": email, "password": password},
            headers={"Accept": "application/json"},
            timeout=self.timeout,
        )
        success = response.status_code == 200

        if success != should_succeed:
            logger.error(
                "Login check %s: expected success=%s, status=%s, body=%s",
                email,
                should_succeed,
                response.status_code,
                response.text[:500],
            )
            return False

        logger.info(
            "Login check %s: PASS (expected success=%s).",
            email,
            should_succeed,
        )
        return True

    def run_tenant_negative_tests(self, endpoint: str) -> Dict[str, str]:
        tests = {
            "invalid_max_length": "FAIL",
            "not_found": "FAIL",
            "without_token": "FAIL",
            "invalid_token": "FAIL",
        }

        bad_payload = {
            "code": "X" * 256,
            "name": "Invalid Tenant",
            "status": "ACTIVE",
        }
        response = self.session.post(
            self.url(endpoint),
            json=bad_payload,
            timeout=self.timeout,
        )
        tests["invalid_max_length"] = (
            "PASS" if response.status_code == 400 else "FAIL"
        )

        response = self.session.get(
            self.url(
                self.detail_endpoint(
                    endpoint,
                    "00000000-0000-0000-0000-000000000000",
                )
            ),
            timeout=self.timeout,
        )
        tests["not_found"] = (
            "PASS" if response.status_code == 404 else "FAIL"
        )

        response = requests.get(
            self.url(endpoint),
            headers={"Accept": "application/json"},
            timeout=self.timeout,
        )
        tests["without_token"] = (
            "PASS" if response.status_code == 401 else "FAIL"
        )

        response = requests.get(
            self.url(endpoint),
            headers={
                "Accept": "application/json",
                "Authorization": "Bearer invalid-token",
            },
            timeout=self.timeout,
        )
        tests["invalid_token"] = (
            "PASS" if response.status_code == 401 else "FAIL"
        )

        return tests


def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv("ERP_SEED_LOG_LEVEL", "INFO").upper(),
        format="[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


def build_client() -> SeederClient:
    base_url = os.getenv("ERP_BASE_URL", "http://127.0.0.1:8000")
    email = os.getenv("ERP_ADMIN_EMAIL", "testerp@gmail.com")
    password = os.getenv("ERP_ADMIN_PASSWORD", "testerp123")
    state_file = os.getenv(
        "ERP_STATE_FILE",
        str(Path(__file__).with_name("seeding_state.json")),
    )
    timeout = int(os.getenv("ERP_REQUEST_TIMEOUT", "30"))

    return SeederClient(
        base_url=base_url,
        email=email,
        password=password,
        state_file=state_file,
        timeout=timeout,
    )


def stage_is_successful(reports: Sequence[Mapping[str, Any]]) -> bool:
    return bool(reports) and all(bool(report.get("success")) for report in reports)
