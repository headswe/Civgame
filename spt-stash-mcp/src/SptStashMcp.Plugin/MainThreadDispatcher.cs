using System;
using System.Collections.Concurrent;
using System.Threading;
using UnityEngine;

namespace SptStashMcp
{
    /// <summary>
    /// The inventory may only be touched from Unity's main thread. HTTP worker threads queue
    /// work here and block until <see cref="Update"/> has run it.
    /// </summary>
    public class MainThreadDispatcher : MonoBehaviour
    {
        static readonly ConcurrentQueue<Action> Queue = new ConcurrentQueue<Action>();
        static int _mainThreadId = -1;

        void Awake() => _mainThreadId = Thread.CurrentThread.ManagedThreadId;

        void Update()
        {
            // Bounded so a flood of requests can't stall a frame for long.
            for (int i = 0; i < 64 && Queue.TryDequeue(out var job); i++) job();
        }

        public static T Run<T>(Func<T> fn, int timeoutMs = 10000)
        {
            if (Thread.CurrentThread.ManagedThreadId == _mainThreadId) return fn();

            T result = default;
            Exception error = null;
            using (var done = new ManualResetEvent(false))
            {
                Queue.Enqueue(() =>
                {
                    try { result = fn(); }
                    catch (Exception e) { error = e; }
                    finally { try { done.Set(); } catch (ObjectDisposedException) { /* caller timed out */ } }
                });
                if (!done.WaitOne(timeoutMs))
                    throw new TimeoutException("The game did not process the request within " + timeoutMs + " ms (is it paused or loading?).");
            }
            if (error != null) throw new InvalidOperationException(error.Message, error);
            return result;
        }
    }
}
