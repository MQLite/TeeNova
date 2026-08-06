using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.Portfolio;
using TeeNova.Portfolio.PrivateStorage;

namespace TeeNova.Application.Tests.Portfolio;

public class LocalPortfolioObjectStorageTests : IDisposable
{
    private readonly string _root=Path.Combine(Path.GetTempPath(),"teenova-portfolio-tests",Guid.NewGuid().ToString("N"));
    [Fact]
    public async Task Round_trip_and_delete_use_server_object_key(){var expected=new byte[]{1,2,3};var store=Store();var key=Guid.NewGuid().ToString("N");await store.SaveAsync(key,new MemoryStream(expected));await using(var read=await store.OpenReadAsync(key)){using var copy=new MemoryStream();await read.CopyToAsync(copy);Assert.Equal(expected,copy.ToArray());}await store.DeleteAsync(key);await Assert.ThrowsAsync<FileNotFoundException>(()=>store.OpenReadAsync(key));}
    [Theory][InlineData("../secret")][InlineData("abc/def")][InlineData("not-hex-not-hex-not-hex-not-hex-")]
    public async Task Traversal_and_unsafe_keys_are_rejected(string key){await Assert.ThrowsAsync<InvalidOperationException>(()=>Store().OpenReadAsync(key));}
    private LocalPortfolioObjectStorage Store()=>new(new TestEnvironment(_root),Options.Create(new PortfolioOptions{StorageRoot="media"}));
    public void Dispose(){if(Directory.Exists(_root))Directory.Delete(_root,true);}
    private sealed class TestEnvironment(string root):IHostEnvironment
    { public string EnvironmentName{get;set;}="Test";public string ApplicationName{get;set;}="Tests";public string ContentRootPath{get;set;}=root;public IFileProvider ContentRootFileProvider{get;set;}=new NullFileProvider(); }
}
