namespace TeeNova.Payments.Mock;

public sealed class MockWindcaveOnlinePaymentProvider : MockOnlinePaymentProviderBase
{
    public override PaymentProvider Provider => PaymentProvider.Windcave;
}
