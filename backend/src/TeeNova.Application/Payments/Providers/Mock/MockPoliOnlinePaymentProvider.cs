namespace TeeNova.Payments.Mock;

public sealed class MockPoliOnlinePaymentProvider : MockOnlinePaymentProviderBase
{
    public override PaymentProvider Provider => PaymentProvider.Poli;
}
