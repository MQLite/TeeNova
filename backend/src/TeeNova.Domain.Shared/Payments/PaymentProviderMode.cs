namespace TeeNova.Payments;

/// <summary>
/// Operating mode of a persisted payment provider configuration (Jira 9902).
///
/// Only <see cref="Test"/> is usable in this phase. <see cref="Live"/> exists solely so the enum is
/// future-proof and so every write/runtime path can explicitly REJECT it — live payment is intentionally
/// not enabled here. No code path may persist, enable, or resolve a <see cref="Live"/> configuration.
/// </summary>
public enum PaymentProviderMode
{
    /// <summary>Stripe test mode — sk_test_/whsec_ keys only. The only mode allowed in Jira 9902.</summary>
    Test = 0,

    /// <summary>Live mode — intentionally blocked in Jira 9902. Present only so it can be rejected explicitly.</summary>
    Live = 1,
}
