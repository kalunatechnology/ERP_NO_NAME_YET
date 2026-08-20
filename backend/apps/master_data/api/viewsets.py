from apps.master_data.models import Party, PartyRole, Contact, Address, CustomerProfile, SupplierProfile, ProductCategory, UOM, Product, Currency, ExchangeRate, PaymentTerm, TaxCode, CostCenter, Department, Employee, Warehouse, WarehouseLocation, WorkCenter, Machine
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import PartySerializer, PartyRoleSerializer, ContactSerializer, AddressSerializer, CustomerProfileSerializer, SupplierProfileSerializer, ProductCategorySerializer, UOMSerializer, ProductSerializer, CurrencySerializer, ExchangeRateSerializer, PaymentTermSerializer, TaxCodeSerializer, CostCenterSerializer, DepartmentSerializer, EmployeeSerializer, WarehouseSerializer, WarehouseLocationSerializer, WorkCenterSerializer, MachineSerializer

class PartyViewSet(BaseERPModelViewSet):
    queryset = Party.objects.all()
    serializer_class = PartySerializer


class PartyRoleViewSet(BaseERPModelViewSet):
    queryset = PartyRole.objects.all()
    serializer_class = PartyRoleSerializer


class ContactViewSet(BaseERPModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer


class AddressViewSet(BaseERPModelViewSet):
    queryset = Address.objects.all()
    serializer_class = AddressSerializer


from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from decimal import Decimal

class CustomerProfileViewSet(BaseERPModelViewSet):
    queryset = CustomerProfile.objects.all()
    serializer_class = CustomerProfileSerializer

    @action(detail=False, methods=["post"], url_path="set-credit-limit")
    def set_credit_limit(self, request):
        from apps.master_data.models import Party
        from apps.core.models import Company
        from apps.crm.workflow_services import calculate_credit_snapshot

        party_id = request.data.get("party_id") or request.data.get("customer_party")
        credit_limit = request.data.get("credit_limit")
        credit_hold = request.data.get("credit_hold", False)
        risk_category = request.data.get("risk_category", "LOW")

        if not party_id:
            raise ValidationError({"party_id": "Customer Party wajib ditentukan."})

        party = Party.objects.filter(pk=party_id).first()
        if not party:
            raise ValidationError({"party_id": "Customer Party tidak ditemukan."})

        profile, _ = CustomerProfile.objects.get_or_create(party=party)
        if credit_limit is not None:
            profile.credit_limit = Decimal(str(credit_limit))
        profile.credit_hold = bool(credit_hold)
        profile.risk_category = risk_category
        profile.save()

        comp_id = request.headers.get("X-Company-ID") or request.data.get("company")
        company = Company.objects.filter(pk=comp_id).first() if comp_id else Company.objects.first()
        snapshot = calculate_credit_snapshot(party, company) if company else None

        return Response({
            "profile": self.get_serializer(profile).data,
            "snapshot": {
                "credit_limit": str(snapshot.credit_limit) if snapshot else str(profile.credit_limit),
                "available_credit": str(snapshot.available_credit) if snapshot else str(profile.credit_limit),
                "outstanding_receivable": str(snapshot.outstanding_receivable) if snapshot else "0",
                "overdue_amount": str(snapshot.overdue_amount) if snapshot else "0",
                "credit_status": snapshot.credit_status if snapshot else "AVAILABLE",
            }
        })


class SupplierProfileViewSet(BaseERPModelViewSet):
    queryset = SupplierProfile.objects.all()
    serializer_class = SupplierProfileSerializer


class ProductCategoryViewSet(BaseERPModelViewSet):
    queryset = ProductCategory.objects.all()
    serializer_class = ProductCategorySerializer


class UOMViewSet(BaseERPModelViewSet):
    queryset = UOM.objects.all()
    serializer_class = UOMSerializer


class ProductViewSet(BaseERPModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer


class CurrencyViewSet(BaseERPModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer


class ExchangeRateViewSet(BaseERPModelViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer


class PaymentTermViewSet(BaseERPModelViewSet):
    queryset = PaymentTerm.objects.all()
    serializer_class = PaymentTermSerializer


class TaxCodeViewSet(BaseERPModelViewSet):
    queryset = TaxCode.objects.all()
    serializer_class = TaxCodeSerializer


class CostCenterViewSet(BaseERPModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer


class DepartmentViewSet(BaseERPModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class EmployeeViewSet(BaseERPModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


class WarehouseViewSet(BaseERPModelViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer


class WarehouseLocationViewSet(BaseERPModelViewSet):
    queryset = WarehouseLocation.objects.all()
    serializer_class = WarehouseLocationSerializer


class WorkCenterViewSet(BaseERPModelViewSet):
    queryset = WorkCenter.objects.all()
    serializer_class = WorkCenterSerializer


class MachineViewSet(BaseERPModelViewSet):
    queryset = Machine.objects.all()
    serializer_class = MachineSerializer


