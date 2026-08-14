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
from requests import Response
from requests.exceptions import RequestException


SEEDER_COMMON_VERSION = "2026-08-11-finance-signature-v3"

logger = logging.getLogger("ERPSeeder")


class SeederError(RuntimeError):
    """Kesalahan yang menghentikan satu tahap seeding."""


class SeederClient:
    """
    HTTP client generik untuk seluruh ERP seeder.

    Fitur:
    - JWT login + refresh otomatis;
    - membaca OpenAPI schema live dari Django;
    - validasi endpoint dan payload berdasarkan OpenAPI;
    - idempotent upsert berdasarkan seeding_state.json + exact match;
    - lifecycle test: upsert, pagination, search, ordering, retrieve,
      patch, delete;
    - penyimpanan UUID dependency secara atomik;
    - header X-Company-ID untuk resource multi-company.

    Environment variables:
        ERP_BASE_URL
        ERP_ADMIN_EMAIL
        ERP_ADMIN_PASSWORD
        ERP_STATE_FILE
        ERP_REQUEST_TIMEOUT
        ERP_OPENAPI_PATH
        ERP_SEED_LOG_LEVEL
    """

    def __init__(
        self,
        *,
        base_url: str,
        email: str,
        password: str,
        state_file: str | Path,
        timeout: int = 30,
        openapi_path: str = "/api/schema/?format=json",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.state_file = Path(state_file).expanduser().resolve()
        self.timeout = timeout
        self.openapi_path = openapi_path

        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.schema: Dict[str, Any] = {}
        self.state: Dict[str, Any] = self._load_state()

    # ==================================================================
    # Bootstrap / authentication / OpenAPI
    # ==================================================================

    def bootstrap(self) -> None:
        logger.info("Bootstrap ERP Seeder: %s", self.base_url)
        self.authenticate()
        self.load_openapi_schema()

    def authenticate(self) -> None:
        endpoint = "/api/v1/auth/token/"

        try:
            response = self.session.post(
                self.url(endpoint),
                json={
                    "email": self.email,
                    "password": self.password,
                },
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise SeederError(
                f"Tidak dapat terhubung ke {self.url(endpoint)}: {exc}"
            ) from exc

        data = self._parse_response(response)

        if response.status_code != 200:
            raise SeederError(
                f"Autentikasi gagal ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        self.access_token = (
            data.get("access") if isinstance(data, dict) else None
        )
        self.refresh_token = (
            data.get("refresh") if isinstance(data, dict) else None
        )

        if not self.access_token:
            raise SeederError(
                "Response login tidak memiliki field 'access'."
            )

        self.session.headers.update(
            {"Authorization": f"Bearer {self.access_token}"}
        )

        logger.info("Autentikasi berhasil sebagai %s.", self.email)

    def refresh_access_token(self) -> None:
        if not self.refresh_token:
            raise SeederError("Refresh token tidak tersedia.")

        endpoint = "/api/v1/auth/token/refresh/"

        try:
            response = requests.post(
                self.url(endpoint),
                json={"refresh": self.refresh_token},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise SeederError(
                f"Refresh token gagal karena koneksi: {exc}"
            ) from exc

        data = self._parse_response(response)

        if response.status_code != 200 or not isinstance(data, dict):
            raise SeederError(
                f"Refresh token gagal ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        access = data.get("access")
        if not access:
            raise SeederError(
                "Response refresh token tidak memiliki field 'access'."
            )

        self.access_token = str(access)
        self.refresh_token = (
            str(data.get("refresh"))
            if data.get("refresh")
            else self.refresh_token
        )

        self.session.headers.update(
            {"Authorization": f"Bearer {self.access_token}"}
        )

        logger.info("Access token berhasil diperbarui.")

    def load_openapi_schema(self) -> None:
        try:
            response = self.session.get(
                self.url(self.openapi_path),
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise SeederError(
                f"OpenAPI schema tidak dapat diakses di "
                f"{self.url(self.openapi_path)}: {exc}"
            ) from exc

        data = self._parse_response(response)

        if response.status_code != 200 or not isinstance(data, dict):
            raise SeederError(
                f"OpenAPI schema gagal dimuat ({response.status_code}): "
                f"{self._error_message(data)}"
            )

        if not isinstance(data.get("paths"), dict):
            raise SeederError(
                "OpenAPI schema tidak memiliki object 'paths'."
            )

        self.schema = data

        logger.info(
            "OpenAPI schema dimuat: %s path, %s component.",
            len(data.get("paths", {})),
            len(data.get("components", {}).get("schemas", {})),
        )

    # ==================================================================
    # State file
    # ==================================================================

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
            data = json.loads(
                self.state_file.read_text(encoding="utf-8")
            )
        except (json.JSONDecodeError, OSError) as exc:
            raise SeederError(
                f"State file tidak dapat dibaca: "
                f"{self.state_file}: {exc}"
            ) from exc

        if not isinstance(data, dict):
            raise SeederError(
                "State file harus berisi JSON object."
            )

        data.setdefault("meta", {})
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

        self.state_file.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            delete=False,
            dir=self.state_file.parent,
            suffix=".tmp",
        ) as handle:
            json.dump(
                self.state,
                handle,
                ensure_ascii=False,
                indent=2,
            )
            temp_name = handle.name

        Path(temp_name).replace(self.state_file)

        logger.info(
            "State tersimpan: %s",
            self.state_file,
        )

    def state_mapping(
        self,
        path: Sequence[str],
    ) -> Dict[str, Any]:
        current: Dict[str, Any] = self.state

        for key in path:
            value = current.setdefault(key, {})
            if not isinstance(value, dict):
                raise SeederError(
                    f"State path {'/'.join(path)} bukan object JSON."
                )
            current = value

        return current

    def require_state_id(
        self,
        path: Sequence[str],
        label: str,
    ) -> str:
        current: Any = self.state

        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)

        if not current:
            raise SeederError(
                f"Dependency '{label}' tidak ditemukan pada state path "
                f"{'.'.join(path)}. Jalankan stage dependency terlebih dahulu."
            )

        return str(current)


    def resolve_state_or_api_id(
        self,
        *,
        path: Sequence[str],
        label: str,
        endpoint: str,
        match_fields: Mapping[str, Any],
        search_term: str = "",
        company_id: Optional[str] = None,
    ) -> str:
        """
        Resolve dependency UUID from seeding_state.json first.
        If missing/stale, search the live API and repair the state automatically.
        """
        current: Any = self.state

        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)

        if current:
            return str(current)

        # Ensure endpoint exists in the live OpenAPI schema.
        self.assert_operation(endpoint, "GET")

        params: Dict[str, Any] = {
            "page": 1,
            "page_size": 100,
        }
        if search_term:
            params["search"] = search_term

        _, data = self.request(
            "GET",
            endpoint,
            params=params,
            company_id=company_id,
            expected=(200,),
        )

        candidates: list[Dict[str, Any]] = []

        for item in self._list_items(data):
            if not isinstance(item, dict) or not item.get("id"):
                continue

            matched = True

            for field, expected_value in match_fields.items():
                actual_value = item.get(field)

                if not self._equivalent(actual_value, expected_value):
                    matched = False
                    break

            if matched:
                candidates.append(item)

        if len(candidates) == 1:
            record_id = str(candidates[0]["id"])

            if not path:
                raise SeederError(
                    f"State path untuk dependency '{label}' kosong."
                )

            parent = self.state_mapping(path[:-1])
            parent[path[-1]] = record_id
            self.save_state()

            logger.info(
                "[DEPENDENCY RECOVERED] %s -> %s via %s",
                label,
                record_id,
                endpoint,
            )

            return record_id

        if len(candidates) > 1:
            raise SeederError(
                f"Dependency '{label}' ditemukan lebih dari satu kali di "
                f"{endpoint} dengan match {dict(match_fields)}."
            )

        raise SeederError(
            f"Dependency '{label}' tidak ada di state path "
            f"{'.'.join(path)} dan tidak ditemukan di database melalui "
            f"{endpoint} dengan match {dict(match_fields)}."
        )
    # ==================================================================
    # OpenAPI inspection
    # ==================================================================

    def assert_operation(
        self,
        endpoint: str,
        method: str,
    ) -> Dict[str, Any]:
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

    def match_schema_endpoint(
        self,
        endpoint: str,
    ) -> Optional[str]:
        """
        Cocokkan URL konkret:
            /api/v1/foo/<uuid>/post/

        dengan template OpenAPI:
            /api/v1/foo/{id}/post/
        """
        paths = self.schema.get("paths", {})

        endpoint_path = endpoint.split("?", 1)[0]

        if endpoint_path in paths:
            return endpoint_path

        for template in paths:
            # Escape seluruh template, lalu ubah placeholder escaped
            # seperti \{id\} menjadi segmen path [^/]+.
            escaped = re.escape(template)
            pattern = re.sub(
                r"\\\{[^/]+?\\\}",
                r"[^/]+",
                escaped,
            )

            if re.fullmatch(pattern, endpoint_path):
                return template

        return None

    def request_schema(
        self,
        endpoint: str,
        method: str,
    ) -> Dict[str, Any]:
        operation = self.assert_operation(endpoint, method)

        request_body = operation.get("requestBody", {})
        content = (
            request_body.get("content", {})
            if isinstance(request_body, dict)
            else {}
        )

        media = (
            content.get("application/json")
            or content.get("application/x-www-form-urlencoded")
            or content.get("multipart/form-data")
            or {}
        )

        schema = (
            media.get("schema", {})
            if isinstance(media, dict)
            else {}
        )

        return self._resolve_schema(schema)

    def validate_payload(
        self,
        endpoint: str,
        method: str,
        payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        """
        Validasi sederhana dan aman terhadap request schema OpenAPI.

        _key dan field lokal lain yang diawali "_" tidak dikirim ke API.
        """
        clean: Dict[str, Any] = {
            key: value
            for key, value in payload.items()
            if not key.startswith("_")
        }

        request_schema = self.request_schema(
            endpoint,
            method,
        )

        # Endpoint tanpa request body.
        if not request_schema:
            if clean:
                logger.debug(
                    "%s %s tidak mendefinisikan request schema; "
                    "payload diteruskan tanpa validasi field.",
                    method.upper(),
                    endpoint,
                )
            return clean

        properties = request_schema.get("properties", {})
        required = set(request_schema.get("required", []))

        # Bila OpenAPI mendefinisikan object tanpa properties,
        # jangan memblokir payload karena sebagian custom action
        # memang didokumentasikan longgar.
        if isinstance(properties, dict) and properties:
            unknown = sorted(
                set(clean) - set(properties)
            )

            if unknown:
                raise SeederError(
                    f"{method.upper()} {endpoint}: "
                    f"field tidak ada pada Swagger: "
                    f"{', '.join(unknown)}"
                )

            missing = sorted(
                field
                for field in required
                if field not in clean
                or clean[field] in (None, "")
            )

            if missing:
                raise SeederError(
                    f"{method.upper()} {endpoint}: "
                    f"field wajib belum diisi: "
                    f"{', '.join(missing)}"
                )

            for field, value in clean.items():
                field_schema = self._resolve_schema(
                    properties.get(field, {})
                )

                self._validate_value(
                    endpoint=endpoint,
                    field=field,
                    value=value,
                    schema=field_schema,
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
            return

        enum = schema.get("enum")
        if enum and value not in enum:
            raise SeederError(
                f"{endpoint}: nilai {field}={value!r} "
                f"tidak termasuk enum {enum}."
            )

        value_type = schema.get("type")

        if value_type == "string" and not isinstance(value, str):
            raise SeederError(
                f"{endpoint}: field {field} harus string."
            )

        if value_type == "boolean" and not isinstance(value, bool):
            raise SeederError(
                f"{endpoint}: field {field} harus boolean."
            )

        if (
            value_type == "integer"
            and (
                not isinstance(value, int)
                or isinstance(value, bool)
            )
        ):
            raise SeederError(
                f"{endpoint}: field {field} harus integer."
            )

        if value_type == "array" and not isinstance(value, list):
            raise SeederError(
                f"{endpoint}: field {field} harus array."
            )

        if value_type == "object" and not isinstance(value, dict):
            raise SeederError(
                f"{endpoint}: field {field} harus object."
            )

        max_length = schema.get("maxLength")

        if (
            max_length
            and isinstance(value, str)
            and len(value) > int(max_length)
        ):
            raise SeederError(
                f"{endpoint}: field {field} "
                f"melebihi maxLength {max_length}."
            )

        fmt = schema.get("format")

        if fmt == "uuid" and value:
            try:
                UUID(str(value))
            except (ValueError, TypeError) as exc:
                raise SeederError(
                    f"{endpoint}: field {field} "
                    f"bukan UUID valid: {value}"
                ) from exc

        if fmt == "date" and value:
            try:
                date.fromisoformat(str(value))
            except ValueError as exc:
                raise SeederError(
                    f"{endpoint}: field {field} "
                    f"bukan tanggal ISO YYYY-MM-DD."
                ) from exc

        if fmt == "date-time" and value:
            try:
                datetime.fromisoformat(
                    str(value).replace("Z", "+00:00")
                )
            except ValueError as exc:
                raise SeederError(
                    f"{endpoint}: field {field} "
                    f"bukan ISO date-time."
                ) from exc

        if (
            fmt in {"decimal", "float", "double"}
            and value not in (None, "")
        ):
            try:
                Decimal(str(value))
            except (InvalidOperation, ValueError) as exc:
                raise SeederError(
                    f"{endpoint}: field {field} "
                    f"bukan decimal valid."
                ) from exc

    def _resolve_schema(
        self,
        value: Any,
        seen: Optional[set[str]] = None,
    ) -> Dict[str, Any]:
        if not isinstance(value, dict):
            return {}

        seen = (
            set()
            if seen is None
            else set(seen)
        )

        ref = value.get("$ref")

        if ref:
            if ref in seen:
                return {}

            seen.add(ref)
            target = self._resolve_pointer(ref)

            return self._resolve_schema(
                target,
                seen,
            )

        all_of = value.get("allOf")

        if isinstance(all_of, list):
            merged: Dict[str, Any] = {
                "type": "object",
                "properties": {},
                "required": [],
            }

            for part in all_of:
                resolved = self._resolve_schema(
                    part,
                    seen,
                )

                merged["properties"].update(
                    resolved.get("properties", {})
                )

                merged["required"].extend(
                    resolved.get("required", [])
                )

                for key, item in resolved.items():
                    if key not in {
                        "properties",
                        "required",
                    }:
                        merged[key] = item

            merged["required"] = list(
                dict.fromkeys(merged["required"])
            )

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
                        if isinstance(option, dict)
                        and option.get("type") != "null"
                    ),
                    options[0],
                )

                merged = dict(value)
                merged.pop(composition, None)
                merged.update(
                    self._resolve_schema(
                        non_null,
                        seen,
                    )
                )

                if any(
                    isinstance(option, dict)
                    and option.get("type") == "null"
                    for option in options
                ):
                    merged["nullable"] = True

                return merged

        return deepcopy(value)

    def _resolve_pointer(
        self,
        ref: str,
    ) -> Any:
        if not ref.startswith("#/"):
            return {}

        current: Any = self.schema

        for part in ref[2:].split("/"):
            part = (
                part
                .replace("~1", "/")
                .replace("~0", "~")
            )

            if not isinstance(current, dict):
                return {}

            current = current.get(part)

        return current

    # ==================================================================
    # HTTP
    # ==================================================================

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
    ) -> tuple[Response, Any]:
        method = method.upper()

        schema_endpoint = self.match_schema_endpoint(
            endpoint
        )

        if endpoint.startswith("/api/") and schema_endpoint:
            self.assert_operation(
                schema_endpoint,
                method,
            )

        clean_payload: Optional[Dict[str, Any]] = None

        if payload is not None:
            if (
                validate_schema
                and schema_endpoint
            ):
                clean_payload = self.validate_payload(
                    schema_endpoint,
                    method,
                    payload,
                )
            else:
                clean_payload = {
                    key: value
                    for key, value in payload.items()
                    if not key.startswith("_")
                }

        headers: Dict[str, str] = {}

        if company_id:
            headers["X-Company-ID"] = str(company_id)

        if not use_auth:
            headers["Authorization"] = ""

        try:
            response = self.session.request(
                method,
                self.url(endpoint),
                json=clean_payload,
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
        except RequestException as exc:
            raise SeederError(
                f"{method} {endpoint} gagal karena koneksi: {exc}"
            ) from exc

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
                f"{method} {endpoint} gagal "
                f"({response.status_code}); "
                f"expected {sorted(expected_set)}: "
                f"{self._error_message(data)}"
            )

        return response, data

    @staticmethod
    def _parse_response(
        response: Response,
    ) -> Any:
        if (
            response.status_code == 204
            or not response.content
        ):
            return None

        try:
            return response.json()
        except ValueError:
            return response.text

    @staticmethod
    def _error_message(
        data: Any,
    ) -> str:
        if data is None:
            return "(empty response)"

        if isinstance(data, str):
            return data[:1000]

        if isinstance(data, dict):
            if data.get("detail"):
                return str(data["detail"])

            return json.dumps(
                data,
                ensure_ascii=False,
            )[:2000]

        return str(data)[:1000]

    def url(
        self,
        endpoint: str,
    ) -> str:
        return urljoin(
            f"{self.base_url}/",
            endpoint.lstrip("/"),
        )

    @staticmethod
    def detail_endpoint(
        endpoint: str,
        record_id: str,
    ) -> str:
        return (
            f"{endpoint.rstrip('/')}/"
            f"{record_id}/"
        )

    # ==================================================================
    # Generic CRUD lifecycle
    # ==================================================================

    def seed_resource(
        self,
        *,
        stage_name: str,
        state_path: Sequence[str],
        endpoint: str,
        items: Sequence[Mapping[str, Any]],
        match_fields: Sequence[str],
        patch_payload: Optional[Mapping[str, Any]] = None,
        delete_key: Optional[str] = None,
        search_term: str = "",
        company_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.assert_operation(
            endpoint,
            "GET",
        )
        self.assert_operation(
            endpoint,
            "POST",
        )

        records = self.state_mapping(
            state_path
        )

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

        logger.info(
            "Seeding %s melalui %s",
            stage_name,
            endpoint,
        )

        successful = 0

        for raw_item in items:
            key = str(
                raw_item.get("_key") or ""
            ).strip()

            if not key:
                raise SeederError(
                    f"{stage_name}: setiap item "
                    f"harus memiliki _key lokal."
                )

            payload = self.validate_payload(
                endpoint,
                "POST",
                raw_item,
            )

            try:
                record_id, action = self._ensure_record(
                    endpoint=endpoint,
                    key=key,
                    payload=payload,
                    match_fields=match_fields,
                    known_id=(
                        str(records.get(key))
                        if records.get(key)
                        else None
                    ),
                    company_id=company_id,
                )

                records[key] = record_id
                report["records"][key] = record_id
                report["actions"][key] = action
                successful += 1

                logger.info(
                    "[%s] %s -> %s",
                    action,
                    key,
                    record_id,
                )

            except SeederError as exc:
                report["errors"].append(
                    str(exc)
                )
                logger.error("%s", exc)

        report["tests"]["upsert"] = (
            "PASS"
            if successful == len(items)
            else "FAIL"
        )

        # --------------------------------------------------------------
        # Pagination
        # --------------------------------------------------------------
        try:
            _, page_data = self.request(
                "GET",
                endpoint,
                params={
                    "page": 1,
                    "page_size": 2,
                },
                company_id=company_id,
                expected=(200,),
            )

            page_items = self._list_items(
                page_data
            )

            report["tests"]["pagination"] = (
                "PASS"
                if len(page_items) <= 2
                else "FAIL"
            )

        except SeederError as exc:
            report["errors"].append(
                str(exc)
            )

        # --------------------------------------------------------------
        # Search
        # --------------------------------------------------------------
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
            report["errors"].append(
                str(exc)
            )

        # --------------------------------------------------------------
        # Ordering
        # --------------------------------------------------------------
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
            report["errors"].append(
                str(exc)
            )

        persistent_keys = [
            str(item["_key"])
            for item in items
            if str(item["_key"]) != delete_key
            and records.get(str(item["_key"]))
        ]

        target_key = (
            persistent_keys[0]
            if persistent_keys
            else None
        )

        target_id = (
            str(records.get(target_key))
            if target_key
            and records.get(target_key)
            else None
        )

        # --------------------------------------------------------------
        # Retrieve
        # --------------------------------------------------------------
        if target_id:
            try:
                self.request(
                    "GET",
                    self.detail_endpoint(
                        endpoint,
                        target_id,
                    ),
                    company_id=company_id,
                    expected=(200,),
                )

                report["tests"]["retrieve"] = "PASS"

            except SeederError as exc:
                report["errors"].append(
                    str(exc)
                )

        # --------------------------------------------------------------
        # Patch + restore
        #
        # Patch merupakan lifecycle test. Setelah test berhasil, record
        # dikembalikan ke payload seed aslinya supaya data dummy final
        # tetap konsisten.
        # --------------------------------------------------------------
        if (
            target_id
            and patch_payload is not None
        ):
            try:
                self.request(
                    "PATCH",
                    self.detail_endpoint(
                        endpoint,
                        target_id,
                    ),
                    payload=patch_payload,
                    company_id=company_id,
                    expected=(200,),
                )

                report["tests"]["patch"] = "PASS"

                original_item = next(
                    (
                        item
                        for item in items
                        if str(item.get("_key"))
                        == target_key
                    ),
                    None,
                )

                if original_item:
                    original_payload = {
                        key: value
                        for key, value
                        in original_item.items()
                        if not key.startswith("_")
                    }

                    self.request(
                        "PATCH",
                        self.detail_endpoint(
                            endpoint,
                            target_id,
                        ),
                        payload=original_payload,
                        company_id=company_id,
                        expected=(200,),
                    )

            except SeederError as exc:
                report["tests"]["patch"] = "FAIL"
                report["errors"].append(
                    str(exc)
                )

        # --------------------------------------------------------------
        # Delete test record
        # --------------------------------------------------------------
        if delete_key:
            delete_id = records.get(
                delete_key
            )

            if delete_id:
                try:
                    self.request(
                        "DELETE",
                        self.detail_endpoint(
                            endpoint,
                            str(delete_id),
                        ),
                        company_id=company_id,
                        expected=(200, 202, 204),
                    )

                    report["tests"]["delete"] = "PASS"

                except SeederError as exc:
                    report["tests"]["delete"] = "FAIL"
                    report["errors"].append(
                        str(exc)
                    )

            else:
                report["tests"]["delete"] = "FAIL"
                report["errors"].append(
                    f"Delete key {delete_key} "
                    f"tidak memiliki UUID."
                )

        report["success"] = (
            all(
                value in {"PASS", "SKIP"}
                for value
                in report["tests"].values()
            )
            and not report["errors"]
        )

        reports = self.state_mapping(
            ("reports",)
        )

        reports[stage_name] = report

        self.save_state()

        logger.info(
            "Hasil %s: %s",
            stage_name,
            (
                "PASS"
                if report["success"]
                else "FAIL"
            ),
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
        # --------------------------------------------------------------
        # A. UUID dari state masih valid?
        # --------------------------------------------------------------
        if known_id:
            detail = self.detail_endpoint(
                endpoint,
                known_id,
            )

            try:
                response = self.session.get(
                    self.url(detail),
                    headers=(
                        {"X-Company-ID": str(company_id)}
                        if company_id
                        else None
                    ),
                    timeout=self.timeout,
                )
            except RequestException as exc:
                raise SeederError(
                    f"GET existing {key} gagal "
                    f"karena koneksi: {exc}"
                ) from exc

            if response.status_code == 401 and self.refresh_token:
                self.refresh_access_token()

                response = self.session.get(
                    self.url(detail),
                    headers=(
                        {"X-Company-ID": str(company_id)}
                        if company_id
                        else None
                    ),
                    timeout=self.timeout,
                )

            if response.status_code == 200:
                self.request(
                    "PATCH",
                    detail,
                    payload=payload,
                    company_id=company_id,
                    expected=(200,),
                )

                return (
                    str(known_id),
                    "UPDATED",
                )

            if response.status_code not in {
                404,
                410,
            }:
                data = self._parse_response(
                    response
                )

                raise SeederError(
                    f"GET existing {key} gagal "
                    f"({response.status_code}): "
                    f"{self._error_message(data)}"
                )

        # --------------------------------------------------------------
        # B. State hilang/tidak valid: exact match ke database.
        # --------------------------------------------------------------
        matched_id = self._find_exact_match(
            endpoint=endpoint,
            payload=payload,
            match_fields=match_fields,
            company_id=company_id,
        )

        if matched_id:
            self.request(
                "PATCH",
                self.detail_endpoint(
                    endpoint,
                    matched_id,
                ),
                payload=payload,
                company_id=company_id,
                expected=(200,),
            )

            return (
                matched_id,
                "REUSED",
            )

        # --------------------------------------------------------------
        # C. Belum ada: create.
        # --------------------------------------------------------------
        try:
            _, data = self.request(
                "POST",
                endpoint,
                payload=payload,
                company_id=company_id,
                expected=(200, 201),
            )

        except SeederError:
            # Jika backend mengembalikan duplicate sementara state lokal
            # hilang, coba exact match sekali lagi.
            matched_id = self._find_exact_match(
                endpoint=endpoint,
                payload=payload,
                match_fields=match_fields,
                company_id=company_id,
            )

            if matched_id:
                return (
                    matched_id,
                    "REUSED",
                )

            raise

        if (
            not isinstance(data, dict)
            or not data.get("id")
        ):
            raise SeederError(
                f"POST {endpoint} untuk {key} "
                f"tidak mengembalikan field id."
            )

        return (
            str(data["id"]),
            "CREATED",
        )

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

        params: Dict[str, Any] = {
            "page": 1,
            "page_size": 100,
        }

        first_value = payload.get(
            match_fields[0]
        )

        if (
            first_value not in (None, "")
            and not self._looks_like_uuid(
                first_value
            )
        ):
            params["search"] = first_value

        _, data = self.request(
            "GET",
            endpoint,
            params=params,
            company_id=company_id,
            expected=(200,),
        )

        for item in self._list_items(data):
            if (
                not isinstance(item, dict)
                or not item.get("id")
            ):
                continue

            if all(
                self._equivalent(
                    item.get(field),
                    payload.get(field),
                )
                for field
                in match_fields
            ):
                return str(item["id"])

        return None

    @staticmethod
    def _looks_like_uuid(
        value: Any,
    ) -> bool:
        try:
            UUID(str(value))
            return True

        except (
            ValueError,
            TypeError,
            AttributeError,
        ):
            return False

    @staticmethod
    def _equivalent(
        left: Any,
        right: Any,
    ) -> bool:
        if (
            left is None
            and right in (None, "")
        ):
            return True

        if (
            isinstance(left, bool)
            or isinstance(right, bool)
        ):
            return left is right

        # API sering mengembalikan FK sebagai nested object.
        # Jika payload membandingkan UUID, gunakan nested object's id.
        if (
            isinstance(left, dict)
            and "id" in left
            and not isinstance(right, dict)
        ):
            left = left.get("id")

        if (
            isinstance(right, dict)
            and "id" in right
            and not isinstance(left, dict)
        ):
            right = right.get("id")

        try:
            return (
                Decimal(str(left))
                == Decimal(str(right))
            )

        except (
            InvalidOperation,
            TypeError,
            ValueError,
        ):
            return (
                str(left)
                == str(right)
            )

    @staticmethod
    def _list_items(
        data: Any,
    ) -> list[Dict[str, Any]]:
        if isinstance(data, list):
            return [
                item
                for item in data
                if isinstance(item, dict)
            ]

        if isinstance(data, dict):
            results = data.get("results")

            if isinstance(results, list):
                return [
                    item
                    for item in results
                    if isinstance(item, dict)
                ]

            # Beberapa endpoint custom mungkin memakai "data".
            nested_data = data.get("data")

            if isinstance(nested_data, list):
                return [
                    item
                    for item in nested_data
                    if isinstance(item, dict)
                ]

        return []

    # ==================================================================
    # Additional checks used by earlier stages
    # ==================================================================

    def verify_user_login(
        self,
        *,
        email: str,
        password: str,
        should_succeed: bool,
    ) -> bool:
        try:
            response = requests.post(
                self.url(
                    "/api/v1/auth/token/"
                ),
                json={
                    "email": email,
                    "password": password,
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=self.timeout,
            )
        except RequestException as exc:
            logger.error(
                "Login check %s gagal karena koneksi: %s",
                email,
                exc,
            )
            return False

        success = (
            response.status_code == 200
        )

        if success != should_succeed:
            logger.error(
                "Login check %s: expected success=%s, "
                "status=%s, body=%s",
                email,
                should_succeed,
                response.status_code,
                response.text[:500],
            )

            return False

        logger.info(
            "Login check %s: PASS "
            "(expected success=%s).",
            email,
            should_succeed,
        )

        return True

    def run_tenant_negative_tests(
        self,
        endpoint: str,
    ) -> Dict[str, str]:
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

        try:
            response = self.session.post(
                self.url(endpoint),
                json=bad_payload,
                timeout=self.timeout,
            )

            tests["invalid_max_length"] = (
                "PASS"
                if response.status_code == 400
                else "FAIL"
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
                "PASS"
                if response.status_code == 404
                else "FAIL"
            )

            response = requests.get(
                self.url(endpoint),
                headers={
                    "Accept": "application/json",
                },
                timeout=self.timeout,
            )

            tests["without_token"] = (
                "PASS"
                if response.status_code in {401, 403}
                else "FAIL"
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
                "PASS"
                if response.status_code in {401, 403}
                else "FAIL"
            )

        except RequestException as exc:
            logger.error(
                "Negative tenant test gagal karena koneksi: %s",
                exc,
            )

        return tests


# ======================================================================
# Module-level helpers imported by all seed files
# ======================================================================

def configure_logging() -> None:
    logging.basicConfig(
        level=os.getenv(
            "ERP_SEED_LOG_LEVEL",
            "INFO",
        ).upper(),
        format="[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


def build_client() -> SeederClient:
    base_url = os.getenv(
        "ERP_BASE_URL",
        "http://127.0.0.1:8000",
    )

    email = os.getenv(
        "ERP_ADMIN_EMAIL",
        "testerp@gmail.com",
    )

    password = os.getenv(
        "ERP_ADMIN_PASSWORD",
        "testerp123",
    )

    state_file = os.getenv(
        "ERP_STATE_FILE",
        str(
            Path(__file__).with_name(
                "seeding_state.json"
            )
        ),
    )

    timeout = int(
        os.getenv(
            "ERP_REQUEST_TIMEOUT",
            "30",
        )
    )

    openapi_path = os.getenv(
        "ERP_OPENAPI_PATH",
        "/api/schema/?format=json",
    )

    return SeederClient(
        base_url=base_url,
        email=email,
        password=password,
        state_file=state_file,
        timeout=timeout,
        openapi_path=openapi_path,
    )


def stage_is_successful(
    reports: Sequence[Mapping[str, Any]],
) -> bool:
    return (
        bool(reports)
        and all(
            bool(report.get("success"))
            for report in reports
        )
    )


__all__ = [
    "SeederClient",
    "SeederError",
    "build_client",
    "configure_logging",
    "stage_is_successful",
]