using BepInEx;

namespace FireteamHud
{
    [BepInPlugin(Guid, "Fireteam HUD", Version)]
    public class Plugin : BaseUnityPlugin
    {
        public const string Guid = "com.headswe.fireteamhud";
        public const string Version = "0.1.0";

        void Awake()
        {
            var hud = gameObject.AddComponent<HudRenderer>();
            hud.Config = new HudConfig(Config);
            hud.Log = Logger;
            Logger.LogInfo("Fireteam HUD loaded. Settings are under F12 > Fireteam HUD.");
        }
    }
}
