namespace TeeNova.Payments;

/// <summary>
/// Resolves the IOnlinePaymentProvider implementation for a given PaymentProvider value.
/// </summary>
public interface IOnlinePaymentProviderResolver
{
    /// <summary>
    /// Returns the registered provider implementation for <paramref name="provider"/>.
    /// Throws if no implementation is registered.
    /// </summary>
    IOnlinePaymentProvider Resolve(PaymentProvider provider);
}
