from django.test import SimpleTestCase

from apps.api_common.scoping import find_scope_path
from apps.finance.models import BillingDocumentLine
from apps.projects.models import Task


class ScopePathTests(SimpleTestCase):
    def test_scope_path_through_header_document(self):
        self.assertIsNotNone(find_scope_path(BillingDocumentLine, "company"))

    def test_scope_path_through_project(self):
        self.assertEqual(find_scope_path(Task, "tenant"), "project__tenant")
