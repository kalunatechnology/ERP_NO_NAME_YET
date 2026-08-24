from django.db.models import ProtectedError, RestrictedError
from django.test import SimpleTestCase
from rest_framework import status

from apps.api_common.exceptions import custom_exception_handler


class DummyProtectedObject:
    pass


class DummyChildObject:
    pass


class ProtectedErrorHandlingTests(SimpleTestCase):
    def test_custom_exception_handler_catches_protected_error(self):
        exc = ProtectedError("Cannot delete", [DummyProtectedObject(), DummyChildObject()])
        response = custom_exception_handler(exc, {})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("success"), False)
        self.assertEqual(response.data.get("error"), "PROTECTED_RELATION_ERROR")
        self.assertIn("DummyProtectedObject", response.data.get("detail", ""))
        self.assertIn("DummyChildObject", response.data.get("detail", ""))
        self.assertEqual(
            set(response.data.get("referenced_entities", [])),
            {"DummyProtectedObject", "DummyChildObject"},
        )

    def test_custom_exception_handler_catches_restricted_error(self):
        exc = RestrictedError("Cannot delete", [DummyProtectedObject()])
        response = custom_exception_handler(exc, {})

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("success"), False)
        self.assertEqual(response.data.get("error"), "PROTECTED_RELATION_ERROR")
        self.assertEqual(response.data.get("referenced_entities"), ["DummyProtectedObject"])
