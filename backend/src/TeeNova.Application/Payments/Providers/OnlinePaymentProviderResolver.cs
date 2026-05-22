using System;
using System.Collections.Generic;
using System.Linq;

namespace TeeNova.Payments;

public class OnlinePaymentProviderResolver : IOnlinePaymentProviderResolver
{
    private readonly IEnumerable<IOnlinePaymentProvider> _providers;

    public OnlinePaymentProviderResolver(IEnumerable<IOnlinePaymentProvider> providers)
    {
        _providers = providers;
    }

    public IOnlinePaymentProvider Resolve(PaymentProvider provider)
    {
        var match = _providers.FirstOrDefault(p => p.Provider == provider);

        if (match is null)
            throw new InvalidOperationException(
                $"No online payment provider implementation is registered for '{provider}'. " +
                "Register a provider implementation in the application module.");

        return match;
    }
}
