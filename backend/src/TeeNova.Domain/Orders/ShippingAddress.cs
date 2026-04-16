using Volo.Abp.Domain.Values;

namespace TeeNova.Orders;

/// <summary>
/// Value object — embedded in Order. Immutable after creation.
/// </summary>
public class ShippingAddress : ValueObject
{
    public string FullName { get; init; } = default!;
    public string AddressLine1 { get; init; } = default!;
    public string? AddressLine2 { get; init; }
    public string City { get; init; } = default!;
    public string? State { get; init; }
    public string PostalCode { get; init; } = default!;
    public string Country { get; init; } = "NZ";
    public string? Phone { get; init; }

    protected ShippingAddress() { }

    public ShippingAddress(
        string fullName, string addressLine1, string city,
        string? state, string postalCode, string country = "US",
        string? addressLine2 = null, string? phone = null)
    {
        FullName = fullName;
        AddressLine1 = addressLine1;
        AddressLine2 = addressLine2;
        City = city;
        State = state;
        PostalCode = postalCode;
        Country = country;
        Phone = phone;
    }

    protected override IEnumerable<object?> GetAtomicValues()
    {
        yield return FullName;
        yield return AddressLine1;
        yield return AddressLine2;
        yield return City;
        yield return State;
        yield return PostalCode;
        yield return Country;
        yield return Phone;
    }
}
