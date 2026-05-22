namespace TeeNova.Payments.Mock;

public sealed class MockPayPalOnlinePaymentProvider : MockOnlinePaymentProviderBase
{
    public override PaymentProvider Provider => PaymentProvider.PayPal;
}
