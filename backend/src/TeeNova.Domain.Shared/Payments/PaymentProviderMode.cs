namespace TeeNova.Payments;

/// <summary>
/// Operating mode of a persisted payment provider configuration (Jira 9902, extended in Jira 9908).
///
/// <see cref="Test"/> is the default and is always available. <see cref="Live"/> is GUARDED: a Live
/// configuration may only be persisted/enabled when the server-side unlock flag
/// (<c>OnlinePayments:AllowLiveModeConfiguration</c>) is set — the app service enforces this before ever
/// constructing a Live row. Persisting or enabling a Live row does NOT by itself route public checkout to
/// Live; the active runtime mode is selected separately (<c>OnlinePayments:ActiveMode</c>). Every runtime
/// path still fails closed.
/// </summary>
public enum PaymentProviderMode
{
    /// <summary>Stripe test mode — sk_test_/pk_test_/whsec_ keys only. Default; always available.</summary>
    Test = 0,

    /// <summary>Stripe live mode — sk_live_/pk_live_/whsec_ keys only. Guarded by the server-side unlock flag.</summary>
    Live = 1,
}
