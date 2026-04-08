using Volo.Abp.Reflection;

namespace TeeNova.Permissions;

public static class TeeNovaPermissions
{
    public const string GroupName = "TeeNova";

    public static class Catalog
    {
        public const string Default = GroupName + ".Catalog";
        public const string Create = Default + ".Create";
        public const string Edit = Default + ".Edit";
        public const string Delete = Default + ".Delete";
    }

    public static class Orders
    {
        public const string Default = GroupName + ".Orders";
        public const string ManageStatus = Default + ".ManageStatus";
        public const string ViewAll = Default + ".ViewAll";  // Admin-level
    }

    public static string[] GetAll() => ReflectionHelper.GetPublicConstantsRecursively(typeof(TeeNovaPermissions));
}
