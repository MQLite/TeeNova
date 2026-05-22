namespace TeeNova.Payments.Mock;

public sealed class MockStripeOnlinePaymentProvider : MockOnlinePaymentProviderBase
{
    public override PaymentProvider Provider => PaymentProvider.Stripe;
}
