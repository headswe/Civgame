namespace SptStashMcp.Core
{
    /// <summary>
    /// The game-facing side of the plugin. Calls arrive on HTTP worker threads; the
    /// implementation is responsible for marshalling onto the Unity main thread and
    /// for blocking until the operation has been accepted (or rejected).
    /// </summary>
    public interface IStashBackend
    {
        /// <summary>Null when it is safe to touch the inventory, otherwise the reason it is not.</summary>
        string NotReadyReason();

        StashSnapshot GetSnapshot();

        /// <summary>
        /// Moves an item into a container grid. When <paramref name="location"/> is null the
        /// backend picks the first free spot, trying each grid in order.
        /// </summary>
        MoveResult Move(string itemId, string containerId, GridLocation location);
    }
}
