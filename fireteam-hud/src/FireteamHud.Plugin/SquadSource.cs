using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using BepInEx.Logging;
using Comfort.Common;
using EFT;
using FireteamHud.Core;
using UnityEngine;

namespace FireteamHud
{
    /// <summary>Own position and view direction, used as the radar centre.</summary>
    public struct SelfPose
    {
        public Vector3 Position;
        public float Yaw;
    }

    /// <summary>
    /// Reads the local player and teammates from the game. Everything that touches EFT or
    /// Fika types lives here. Fika is looked up by reflection so the plugin also loads (and
    /// the preview works) without Fika installed, and survives Fika renaming its namespaces.
    /// </summary>
    public class SquadSource
    {
        const BindingFlags AnyInstance = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        const float FikaLookupInterval = 2f;

        readonly ManualLogSource _log;
        readonly List<MemberSighting> _buffer = new List<MemberSighting>();

        Type _coopHandlerType;
        MemberInfo _humanPlayersMember;
        bool _fikaSearched;
        UnityEngine.Object _coopHandler;
        float _nextFikaLookup;

        public SquadSource(ManualLogSource log) { _log = log; }

        public bool FikaLoaded
        {
            get { FindFikaTypes(); return _coopHandlerType != null; }
        }

        /// <summary>The local player, or null outside a raid or once the player is dead.</summary>
        public Player MainPlayer()
        {
            if (!Singleton<GameWorld>.Instantiated) return null;
            var player = Singleton<GameWorld>.Instance.MainPlayer;
            if (player == null || player.HealthController == null || !player.HealthController.IsAlive) return null;
            return player;
        }

        public SelfPose PoseOf(Player player)
        {
            var cam = Camera.main;
            float yaw = cam != null ? cam.transform.eulerAngles.y : player.Rotation.x;
            return new SelfPose { Position = player.Position, Yaw = yaw };
        }

        public List<MemberSighting> Teammates(Player self, TeammateSource source)
        {
            _buffer.Clear();
            IEnumerable<Player> players = null;

            if (source != TeammateSource.SameGroup) players = FikaHumans();
            if (players == null && source != TeammateSource.FikaHumans) players = SameGroup(self);
            if (players == null) return _buffer;

            foreach (var p in players)
            {
                if (p == null || p == self || p.ProfileId == self.ProfileId) continue;
                var pos = p.Position;
                bool alive = p.HealthController != null && p.HealthController.IsAlive;
                _buffer.Add(new MemberSighting(p.ProfileId, p.Profile?.Nickname, pos.x, pos.y, pos.z, alive));
            }
            return _buffer;
        }

        /// <summary>Players with the same non-empty group id as us; humans only.</summary>
        IEnumerable<Player> SameGroup(Player self)
        {
            var groupId = self.Profile?.Info?.GroupId;
            var all = Singleton<GameWorld>.Instance.AllAlivePlayersList;
            if (all == null) return null;
            return all.Where(p => p != null && !p.IsAI && !IsObservedAI(p)
                && (string.IsNullOrEmpty(groupId) || p.Profile?.Info?.GroupId == groupId));
        }

        /// <summary>CoopHandler.HumanPlayers from Fika, or null when Fika isn't running a raid.</summary>
        IEnumerable<Player> FikaHumans()
        {
            FindFikaTypes();
            if (_coopHandlerType == null || _humanPlayersMember == null) return null;

            if (_coopHandler == null && Time.unscaledTime >= _nextFikaLookup)
            {
                _nextFikaLookup = Time.unscaledTime + FikaLookupInterval;
                _coopHandler = UnityEngine.Object.FindObjectOfType(_coopHandlerType);
            }
            if (_coopHandler == null) return null;

            var value = _humanPlayersMember is PropertyInfo prop
                ? prop.GetValue(_coopHandler)
                : ((FieldInfo)_humanPlayersMember).GetValue(_coopHandler);
            return (value as IEnumerable)?.OfType<Player>();
        }

        void FindFikaTypes()
        {
            if (_fikaSearched) return;
            _fikaSearched = true;
            try
            {
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    var name = asm.GetName().Name;
                    if (!name.StartsWith("Fika", StringComparison.OrdinalIgnoreCase)) continue;
                    Type[] types;
                    try { types = asm.GetTypes(); }
                    catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); }

                    _coopHandlerType = types.FirstOrDefault(t => t.Name == "CoopHandler" && typeof(Component).IsAssignableFrom(t));
                    if (_coopHandlerType == null) continue;
                    _humanPlayersMember = (MemberInfo)_coopHandlerType.GetProperty("HumanPlayers", AnyInstance)
                        ?? _coopHandlerType.GetField("HumanPlayers", AnyInstance);
                    _log.LogInfo(_humanPlayersMember != null
                        ? "Fika found (" + name + "); using CoopHandler.HumanPlayers for the squad."
                        : "Fika found but CoopHandler.HumanPlayers is missing; falling back to group ids.");
                    return;
                }
            }
            catch (Exception e)
            {
                _log.LogWarning("Fika lookup failed, falling back to group ids: " + e.Message);
            }
        }

        /// <summary>Bots replicated to Fika clients are observed players that report IsAI false.</summary>
        static bool IsObservedAI(Player p)
        {
            var type = p.GetType();
            if (!ObservedAiProps.TryGetValue(type, out var prop))
                ObservedAiProps[type] = prop = type.GetProperty("IsObservedAI", AnyInstance);
            return prop != null && prop.GetValue(p) is bool b && b;
        }

        static readonly Dictionary<Type, PropertyInfo> ObservedAiProps = new Dictionary<Type, PropertyInfo>();

        /// <summary>Call when a raid ends so the next raid looks up a fresh CoopHandler.</summary>
        public void Reset() => _coopHandler = null;
    }
}
