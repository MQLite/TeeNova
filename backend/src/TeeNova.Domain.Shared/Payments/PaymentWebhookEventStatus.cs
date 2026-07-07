namespace TeeNova.Payments;

/// <summary>
/// Processing lifecycle of a durable provider webhook event record (Jira 9806).
///
/// Terminal-processed states (<see cref="Processed"/>, <see cref="Duplicate"/>, <see cref="Ignored"/>,
/// <see cref="Rejected"/>, <see cref="RequiresManualReview"/>) mean the event has reached a durable
/// outcome and a later re-delivery of the same provider event ID is a replay that must NOT run
/// business logic again.
///
/// Non-terminal states (<see cref="Received"/>, <see cref="Processing"/>, <see cref="Failed"/>) mean an
/// attempt was recorded but did not reach a durable outcome (e.g. an infrastructure failure between
/// registration and processing). A re-delivery for a non-terminal record is allowed to re-attempt.
/// </summary>
public enum PaymentWebhookEventStatus
{
    /// <summary>Event durably registered; business processing not yet completed.</summary>
    Received             = 0,

    /// <summary>Business processing has started (reserved; the flow moves Received → terminal directly).</summary>
    Processing           = 1,

    /// <summary>Payment was applied (or the terminal session update was performed) exactly once.</summary>
    Processed            = 2,

    /// <summary>A replay of an already terminal event; acknowledged with no side effects.</summary>
    Duplicate            = 3,

    /// <summary>Valid verified event that required no local action (unsupported type / already-settled session).</summary>
    Ignored              = 4,

    /// <summary>Event was structurally rejected and carries no evidence of a customer charge.</summary>
    Rejected             = 5,

    /// <summary>Verified event that could not be applied locally but may correspond to a real charge — needs 9810 reconciliation.</summary>
    RequiresManualReview = 6,

    /// <summary>An unexpected/infrastructure failure occurred while processing; re-delivery may re-attempt.</summary>
    Failed               = 7,
}
