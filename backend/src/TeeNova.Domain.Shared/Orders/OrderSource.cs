namespace TeeNova.Orders;

public enum OrderSource
{
    Checkout = 0,
    AdminManual = 1,
    AiOrderImport = 2,
}

public enum OrderItemProductSource
{
    Catalogue = 0,
    AdHoc = 1,
}

public enum OrderAdHocInventoryBehavior
{
    NotTracked = 0,
}
