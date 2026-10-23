namespace SptStashMcp.Core
{
    public interface ILog
    {
        void Info(string message);
        void Warn(string message);
        void Error(string message);
    }

    public class NullLog : ILog
    {
        public void Info(string message) { }
        public void Warn(string message) { }
        public void Error(string message) { }
    }
}
