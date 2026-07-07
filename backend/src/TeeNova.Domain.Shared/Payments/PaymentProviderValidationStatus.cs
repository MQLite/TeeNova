namespace TeeNova.Payments;

/// <summary>
/// Outcome of the last static validation of a persisted payment provider configuration (Jira 9902).
/// Validation is static/offline in this phase (key-prefix and return-URL shape checks) — it never makes a
/// live Stripe API call. Only safe, non-secret status/codes are ever surfaced from this.
/// </summary>
public enum PaymentProviderValidationStatus
{
    /// <summary>No validation has been recorded yet.</summary>
    NotValidated = 0,

    /// <summary>Last validation passed the static checks.</summary>
    Valid        = 1,

    /// <summary>Last validation failed a static check (see the accompanying message code).</summary>
    Invalid      = 2,
}
