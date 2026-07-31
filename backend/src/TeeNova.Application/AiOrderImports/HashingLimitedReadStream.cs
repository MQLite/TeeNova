using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Volo.Abp;

namespace TeeNova.AiOrderImports;

internal sealed class HashingLimitedReadStream : Stream
{
    private readonly Stream _inner;
    private readonly long _maximumBytes;
    private readonly IncrementalHash _hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    private long _bytesRead;
    private bool _completed;

    public HashingLimitedReadStream(Stream inner, long maximumBytes)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _maximumBytes = maximumBytes;
    }

    public long BytesRead => _bytesRead;

    public string GetSha256()
    {
        if (!_completed)
            throw new InvalidOperationException("The source stream has not been read to completion.");
        return Convert.ToHexString(_hash.GetHashAndReset()).ToLowerInvariant();
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        var read = _inner.Read(buffer, offset, count);
        Track(buffer.AsSpan(offset, read));
        if (read == 0) _completed = true;
        return read;
    }

    public override async ValueTask<int> ReadAsync(
        Memory<byte> buffer,
        CancellationToken cancellationToken = default)
    {
        var read = await _inner.ReadAsync(buffer, cancellationToken);
        Track(buffer.Span[..read]);
        if (read == 0) _completed = true;
        return read;
    }

    public override async Task<int> ReadAsync(
        byte[] buffer,
        int offset,
        int count,
        CancellationToken cancellationToken)
    {
        var read = await _inner.ReadAsync(buffer.AsMemory(offset, count), cancellationToken);
        Track(buffer.AsSpan(offset, read));
        if (read == 0) _completed = true;
        return read;
    }

    private void Track(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length == 0) return;
        _bytesRead += bytes.Length;
        if (_bytesRead > _maximumBytes)
            throw new BusinessException(
                AiOrderImportErrorCodes.FileTooLarge,
                "The source document exceeds the configured file-size limit.");
        _hash.AppendData(bytes);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _hash.Dispose();
        base.Dispose(disposing);
    }

    public override bool CanRead => _inner.CanRead;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position
    {
        get => _bytesRead;
        set => throw new NotSupportedException();
    }
    public override void Flush() => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
