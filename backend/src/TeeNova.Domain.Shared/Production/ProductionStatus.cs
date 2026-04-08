namespace TeeNova.Production;

public enum ProductionStatus
{
    Queued = 0,
    Printing = 1,
    QualityCheck = 2,
    ReadyToShip = 3,
    Failed = 4
}
