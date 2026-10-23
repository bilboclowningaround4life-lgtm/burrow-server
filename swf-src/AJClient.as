package
{
   import achievement.AchievementXtCommManager;
   import avatar.AvatarManager;
   import avatar.AvatarWorldView;
   import buddy.Buddy;
   import buddy.BuddyManager;
   import com.sbi.corelib.audio.SBAudio;
   import com.sbi.corelib.audio.SBMusic;
   import com.sbi.corelib.audio.SBSound;
   import com.sbi.debug.DebugUtility;
   import com.sbi.graphics.PaletteHelper;
   import den.DenXtCommManager;
   import item.ItemXtCommManager;
   import den.DenItem;
   import den.DenXtCommManager;
   import item.Item;
   import item.ItemXtCommManager;
   import com.sbi.loader.ResourceStack;
   import com.sbi.popup.SBOkPopup;
   import com.sbi.popup.SBStandardPopup;
   import com.sbi.popup.SBYesNoPopup;
   import createAccountFlow.CreateAccount;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.DisplayObjectContainer;
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.display.Shape;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.geom.ColorTransform;
   import flash.geom.Matrix;
   import flash.utils.ByteArray;
   import flash.geom.Point;
   import flash.geom.Rectangle;
   import flash.events.KeyboardEvent;
   import flash.events.MouseEvent;
   import flash.events.TimerEvent;
   import flash.media.SoundTransform;
   import flash.net.FileFilter;
   import flash.net.FileReference;
   import flash.net.URLLoader;
   import flash.net.URLRequest;
   import flash.text.Font;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.events.UncaughtErrorEvent;
   import flash.filters.DropShadowFilter;
   import flash.filters.GlowFilter;
   import flash.external.ExternalInterface;
   import flash.system.Capabilities;
   import flash.system.LoaderContext;
   import flash.system.Security;
   import flash.system.System;
   import flash.ui.Mouse;
   import flash.utils.Dictionary;
   import flash.utils.Timer;
   import flash.utils.getTimer;
   import flash.utils.setTimeout;
   import game.MinigameManager;
   import gamePlayFlow.GamePlay;
   import gskinner.motion.GTween;
   import gui.DarkenManager;
   import gui.ChatBalloon;
   import gui.EmoticonUtility;
   import gui.GuiManager;
   import loadProgress.LoadProgress;
   import loader.DefPacksDefHelper;
   import localization.LocalizationManager;
   import resource.LoadAvatarCarouselResourceStackable;
   import resource.LoadCursorResourceStackable;
   import room.DebugGUITextbox;
   import room.RoomManagerWorld;
   import waitingRoomFlow.WaitingRoom;
   
   [SWF(width="900", height="550", backgroundColor="#393625", frameRate="24")]
   public class AJClient extends Sprite
   {
      
      private static var _globalDebugLog:DebugGUITextbox;
      
      private static var _toolsInstance:AJClient;
      
      private var _resourceStackLoader:ResourceStack;
      
      private var _finder:Sprite;
      
      private var _finderPanel:Sprite;
      
      private var _finderInputBar:MovieClip;
      
      private var _finderColourBar:MovieClip;
      
      private var _finderInput:TextField;
      
      private var _finderStatus:TextField;
      
      private var _finderPageLabel:TextField;
      
      private var _finderKindButton:MovieClip;
      
      private var _finderRows:Sprite;
      
      private var _finderResults:Array;
      
      private var _finderTotal:int;
      
      private var _finderPage:int;
      
      private var _finderKind:int;
      
      private var _finderColourInput:TextField;

      // the staff's window for one player (openModerate), and what the
      // signed-in role may do ("xsp" from the server; empty for players).
      private var _moderate:Sprite;

      private var _moderateContent:Sprite;

      private var _moderateTitle:TextField;

      private var _moderateName:String;

      private var _moderateReason:int;

      private var _moderateInput:TextField;

      private var _moderateHint:TextField;

      private var _moderateButtons:Array;

      // Staff-only YouTube control for the theatre. The video itself is a
      // browser overlay, called through ExternalInterface below.
      private var _theatreButton:Sprite;

      private var _theatreControl:Sprite;

      private var _theatreInput:TextField;

      // Owner/developer room-effect controls, opened by !event or !host.
      private var _roomControl:Sprite;

      public static var staffRole:String = "";

      public static var staffPermissions:Array = [];
      
      // the items drawn on the rows shown, by row number
      private var _finderIcons:Object = {};
      
      // a hex colour typed, as a local colour id for the previews only
      // (PaletteHelper.customColors): the server makes the real one on Give
      private var _finderHexKey:String = "";
      
      private var _finderHexId:uint = 0;
      
      private var _finderHexCount:uint = 0;
      
      public function AJClient()
      {
         super();
         addEventListener("addedToStage",addedToStageHandler);
      }
      
      public static function get globalDebugLog() : DebugGUITextbox
      {
         return _globalDebugLog;
      }
      
      private function addedToStageHandler(param1:Event) : void
      {
         var _loc2_:Object = null;
         var _loc3_:int = 0;
         removeEventListener("addedToStage",addedToStageHandler);
         addEventListener("enterFrame",onSmoothFrame);
         try
         {
            if(ExternalInterface.available)
            {
               ExternalInterface.addCallback("ajHud",setHudShown);
               ExternalInterface.addCallback("openTheatreControl",openTheatreControl);
            }
         }
         catch(e:Error)
         {
         }
         // the official client lets a SWF from any domain reach into it here
         // (Security.allowDomain("*")). on this server the page, the client
         // and every asset come from one address, so nothing needs that, and
         // a stranger's SWF that got itself loaded must not have it.
         var _loc4_:Boolean = ExternalInterface.available;
         if(_loc4_)
         {
            DebugUtility.debugTrace("addedToStageHandler - extIntAvail is true");
            DebugUtility.debugTrace("mrc dm init ctor starting up call returned:" + ExternalInterface.call("mrc",["dm","AJClient addedToStageHandler starting up"]));
            ExternalInterface.call("handleGAEvent","flashStarted");
         }
         else
         {
            DebugUtility.debugTrace("addedToStageHandler - extIntAvail is false");
         }
         if(!MainFrame.isInitialized())
         {
            if(parent != null)
            {
               if(parent.hasOwnProperty("flashVars"))
               {
                  _loc2_ = parent["flashVars"];
               }
               else
               {
                  _loc2_ = parent.loaderInfo.parameters;
               }
            }
            else
            {
               _loc2_ = loaderInfo.parameters;
            }
            DebugUtility.debugTrace("addedToStageHandler - printing loaderInfo parameters flashvars...");
            _loc3_ = 0;
            for(var _loc5_:String in _loc2_)
            {
               DebugUtility.debugTrace("  flashvar " + _loc5_ + ":" + _loc2_[_loc5_]);
               _loc3_++;
            }
            DebugUtility.debugTrace("addedToStageHandler - ...done printing loaderInfo parameters flashvars - i:" + _loc3_);
            MainFrame.handleLocalExternalCall = GamePlay.handleLocalExternalCall;
            MainFrame.getInstance(_loc2_,setupInit,"",this);
            LoadProgress.updateProgress(2);
            _globalDebugLog = new DebugGUITextbox(this,"","Debug Log [F4]",false,true,true,750,276,true);
            _globalDebugLog.x = 80;
            _globalDebugLog.y = 50;
            DebugUtility.setDebugGUIHandler(_globalDebugLog.appendHtml);
            loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",handleGlobalErrors);
         }
         DebugUtility.debugTrace("AJClient addedToStageHandler finished");
      }
      
      public function setupInit() : void
      {
         gMainFrame.stage.addEventListener("Localization",LocalizationManager.onLocalizationEvent,false,0,true);
         LocalizationManager.currentLanguage = LocalizationManager.accountLanguage = LocalizationManager.getLanguageIdForLocale(gMainFrame.clientInfo.locale);
         LocalizationManager.countryCode = gMainFrame.clientInfo.countryCode;
         var _loc1_:DefPacksDefHelper = new DefPacksDefHelper();
         _loc1_.init(uint("1023" + LocalizationManager.currentLanguage),LocalizationXtCommManager.onLocalizationListResponse,loadResourceItems,2);
         DefPacksDefHelper.mediaArray["1023" + LocalizationManager.currentLanguage] = _loc1_;
         _loc1_ = new DefPacksDefHelper();
         _loc1_.init(uint("1055" + LocalizationManager.accountLanguage),LocalizationXtCommManager.onPreferredLocalizationListResponse,null,2);
         DefPacksDefHelper.mediaArray["1055" + LocalizationManager.accountLanguage] = _loc1_;
      }
      
      public function loadResourceItems() : void
      {
         LoadProgress.updateProgress(3);
         Utility.init(DarkenManager.showLoadingSpiral,DarkenManager.darken,DarkenManager.unDarken);
         _resourceStackLoader = new ResourceStack(gMainFrame.path,gMainFrame.loaderCache.openFile);
         _resourceStackLoader.pushFile("assets/sharedFonts.swf",true);
         _resourceStackLoader.pushFile("assets/HUDAssets.swf",true);
         if(gMainFrame.clientInfo.isCreateAccount)
         {
            _resourceStackLoader.pushClass(new LoadAvatarCarouselResourceStackable());
         }
         if(Mouse["supportsNativeCursor"])
         {
            _resourceStackLoader.pushClass(new LoadCursorResourceStackable());
         }
         if(ExternalInterface.available)
         {
            ExternalInterface.call("aj_initialized");
         }
         if("failedToInitiate" in gMainFrame.clientInfo && gMainFrame.clientInfo.failedToInitiate == true)
         {
            _resourceStackLoader.start(onInitiationFailure);
         }
         else if(gMainFrame.clientInfo.isCreateAccount)
         {
            _resourceStackLoader.start(setupCreateAccount);
         }
         else if(gMainFrame.clientInfo.waitingMode)
         {
            _resourceStackLoader.start(setupWaitingRoom);
         }
         else
         {
            _resourceStackLoader.start(setupGamePlay);
         }
      }
      
      public function setupCreateAccount() : void
      {
         var _loc1_:CreateAccount = new CreateAccount(gMainFrame.clientInfo);
         addChild(_loc1_);
         gMainFrame.createAccount = _loc1_;
         _loc1_.loginCtorHelper();
      }
      
      public function setupWaitingRoom() : void
      {
         var _loc1_:WaitingRoom = new WaitingRoom(gMainFrame.clientInfo);
         addChild(_loc1_);
         gMainFrame.waitingRoom = _loc1_;
         _loc1_.waitCtorHelper();
      }
      
      public function setupGamePlay(param1:Event = null, param2:Event = null) : void
      {
         DebugUtility.debugTrace("setupGamePlay - loginEvt:" + param1 + " connectEvt:" + param2);
         if(gMainFrame.createAccount)
         {
            if(contains(gMainFrame.createAccount))
            {
               removeChild(gMainFrame.createAccount);
            }
            gMainFrame.createAccount = null;
            _resourceStackLoader = null;
         }
         DebugUtility.debugTrace("setupGamePlay - constructing GamePlay - gMainFrame.clientInfo:" + gMainFrame.clientInfo);
         var _loc3_:GamePlay = new GamePlay(gMainFrame.clientInfo,param1,param2);
         addChild(_loc3_);
         gMainFrame.gamePlay = _loc3_;
         DebugUtility.debugTrace("setupGamePlay - gp:" + _loc3_ + " calling worldCtorHelper");
         _loc3_.worldCtorHelper();
         setupItemFinder();
      }
      
      private function setupItemFinder() : void
      {
         if(_toolsInstance != null)
         {
            return;
         }
         _toolsInstance = this;
         _finderResults = [];
         try
         {
            loadFilterLists();
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("chat filter: " + e);
         }
         gMainFrame.stage.addEventListener("keyDown",onFinderKey,true,1000);
         gMainFrame.stage.addEventListener("keyDown",onFinderKey,false,1000);
         startEmojiButton();
         placeTheatreButton();
         gMainFrame.stage.addEventListener("enterFrame",reportTheatreScreen,false,0,true);
      }

      // where the theatre's screen is, for game.html to lay a web video over
      // it exactly: the original player's 512 by 288 at the top left of the
      // theatre layer's videoLayer (movie.VideoPlayerOSMF), in stage
      // coordinates (900 by 550; the page scales them as "showAll" does).
      // "x,y,width,height", or "" with no theatre screen shown; told only
      // when it changes, as the room zooms and scrolls under it.
      //
      // a web video is always drawn over the whole game, so it also gets
      // where the game draws something over the screen (the HUD, the buddy
      // list, a Jammer Wall, chat balloons): "x,y,width,height|columns|rows",
      // a hex row of bits per SCREEN_CELL stage pixels, top to bottom, over
      // the screen and SCREEN_BELOW pixels under it (the page's own button
      // sits there). the page cuts those cells out of the video.
      private static const THEATRE_SCREEN_W:Number = 512;
      private static const THEATRE_SCREEN_H:Number = 288;
      private static const SCREEN_CELL:Number = 4;
      private static const SCREEN_BELOW:Number = 44;
      private static const SCREEN_COVER_EVERY:int = 4; // frames between looks
      private static const SCREEN_COVER_ALPHA:uint = 64; // of 255: drawn on, as far as the video goes
      private static var _theatreScreenTold:String = null;
      private static var _theatreCover:String = "";
      private static var _theatreCoverFrame:int = 0;

      private static function reportTheatreScreen(param1:Event = null) : void
      {
         var _loc2_:String = "";
         var _loc3_:Object = null;
         var _loc4_:DisplayObject = null;
         var _loc5_:Point = null;
         var _loc6_:Point = null;
         try
         {
            _loc3_ = RoomManagerWorld.instance != null ? RoomManagerWorld.instance.theaterWindow : null;
            _loc4_ = _loc3_ != null && _loc3_.hasOwnProperty("videoLayer") ? _loc3_.videoLayer as DisplayObject : null;
            if(_loc4_ != null && shownOnStage(_loc4_))
            {
               _loc5_ = _loc4_.localToGlobal(new Point(0,0));
               _loc6_ = _loc4_.localToGlobal(new Point(THEATRE_SCREEN_W,THEATRE_SCREEN_H));
               _loc2_ = [_loc5_.x,_loc5_.y,_loc6_.x - _loc5_.x,_loc6_.y - _loc5_.y].map(function(param1:Number, ... rest):String
               {
                  return String(Math.round(param1 * 10) / 10);
               }).join(",");
               if(++_theatreCoverFrame >= SCREEN_COVER_EVERY || _theatreScreenTold == null || _theatreScreenTold.indexOf(_loc2_) != 0)
               {
                  _theatreCoverFrame = 0;
                  _theatreCover = theatreCover(_loc3_ as DisplayObject,_loc5_.x,_loc5_.y,_loc6_.x - _loc5_.x,_loc6_.y - _loc5_.y);
               }
               if(_theatreCover != "")
               {
                  _loc2_ += "|" + _theatreCover;
               }
            }
         }
         catch(e:Error)
         {
            _loc2_ = "";
         }
         if(_loc2_ == _theatreScreenTold || !ExternalInterface.available)
         {
            return;
         }
         _theatreScreenTold = _loc2_;
         try
         {
            ExternalInterface.call("ajTheatreScreen",_loc2_);
         }
         catch(e:Error)
         {
         }
      }

      // what is drawn over the theatre screen, as above: the game's windows
      // and buttons, and the room's chat balloons, drawn small, cell by cell.
      // the rest is hidden for the moment of drawing, in between two frames:
      // the screen, what lies under it, and the room itself (its seats and
      // floor are drawn above the screen, and are no reason for the video or
      // its button to step aside). "" for nothing, or when the game will not
      // be drawn.
      private static function theatreCover(param1:DisplayObject, param2:Number, param3:Number, param4:Number, param5:Number) : String
      {
         var _loc6_:Array = [];
         var _loc7_:DisplayObject = param1;
         var _loc8_:DisplayObjectContainer = null;
         var _loc9_:int = 0;
         var _loc10_:DisplayObject = null;
         var _loc11_:int = Math.max(1,Math.ceil(param4 / SCREEN_CELL));
         var _loc12_:int = Math.max(1,Math.ceil((param5 + SCREEN_BELOW) / SCREEN_CELL));
         var _loc13_:BitmapData = null;
         var _loc14_:Array = [];
         var _loc15_:Boolean = false;
         var _loc16_:int = 0;
         var _loc17_:int = 0;
         var _loc18_:int = 0;
         var _loc19_:String = null;
         try
         {
            if(_loc7_.visible)
            {
               _loc7_.visible = false;
               _loc6_.push(_loc7_);
            }
            while(_loc7_.parent != null)
            {
               _loc8_ = _loc7_.parent;
               _loc9_ = _loc8_.getChildIndex(_loc7_);
               while(--_loc9_ >= 0)
               {
                  _loc10_ = _loc8_.getChildAt(_loc9_);
                  if(_loc10_.visible)
                  {
                     _loc10_.visible = false;
                     _loc6_.push(_loc10_);
                  }
               }
               _loc7_ = _loc8_;
            }
            _loc8_ = RoomManagerWorld.instance.layerManager.bkg;
            _loc9_ = _loc8_.numChildren;
            while(--_loc9_ >= 0)
            {
               _loc10_ = _loc8_.getChildAt(_loc9_);
               if(_loc10_ != RoomManagerWorld.instance.layerManager.room_chat && _loc10_.visible)
               {
                  _loc10_.visible = false;
                  _loc6_.push(_loc10_);
               }
            }
            _loc13_ = new BitmapData(_loc11_,_loc12_,true,0);
            _loc13_.draw(gMainFrame.stage,new Matrix(1 / SCREEN_CELL,0,0,1 / SCREEN_CELL,-param2 / SCREEN_CELL,-param3 / SCREEN_CELL));
         }
         catch(e:Error)
         {
            if(_loc13_ != null)
            {
               _loc13_.dispose();
               _loc13_ = null;
            }
         }
         for each(_loc10_ in _loc6_)
         {
            _loc10_.visible = true;
         }
         if(_loc13_ == null)
         {
            return "";
         }
         _loc16_ = 0;
         while(_loc16_ < _loc12_)
         {
            _loc19_ = "";
            _loc17_ = 0;
            while(_loc17_ < _loc11_)
            {
               _loc18_ = 0;
               _loc9_ = 0;
               while(_loc9_ < 4)
               {
                  if(_loc17_ + _loc9_ < _loc11_ && _loc13_.getPixel32(_loc17_ + _loc9_,_loc16_) >>> 24 >= SCREEN_COVER_ALPHA)
                  {
                     _loc18_ |= 8 >> _loc9_;
                     _loc15_ = true;
                  }
                  _loc9_++;
               }
               _loc19_ += _loc18_.toString(16);
               _loc17_ += 4;
            }
            _loc14_.push(_loc19_);
            _loc16_++;
         }
         _loc13_.dispose();
         return _loc15_ ? _loc11_ + "|" + _loc14_.join(",") : "";
      }
      
      public static function openTool(param1:int) : void
      {
         if(_toolsInstance == null)
         {
            return;
         }
         try
         {
            if(param1 == 1)
            {
               _toolsInstance.showChatFilter(true);
            }
            else if(param1 == 2)
            {
               _toolsInstance.showItemMaker(true);
            }
            else
            {
               _toolsInstance.showItemFinder(true);
            }
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer((param1 == 1 ? "chat filter: " : "item giver: ") + e + "\n" + e.getStackTrace());
         }
      }
      
      // when a player was last seen, for their card: param1 is the time in
      // seconds the server sends in place of "days since last login".
      // "12:13 (1 hour ago)" within a day, "10:45 October 10 (1 day ago)"
      // within thirty, "8:44 January 1 2026" beyond. in this computer's
      // time zone.
      public static function lastSeenText(param1:int) : String
      {
         var _loc2_:Array = ["January","February","March","April","May","June","July","August","September","October","November","December"];
         var _loc3_:Date = new Date(param1 * 1000);
         var _loc4_:Number = Math.max(0,Math.floor((new Date().time - _loc3_.time) / 60000));
         var _loc5_:int = int(_loc4_ / 60);
         var _loc6_:int = int(_loc4_ / 1440);
         var _loc7_:String = _loc3_.hours + ":" + (_loc3_.minutes < 10 ? "0" : "") + _loc3_.minutes;
         if(_loc6_ >= 30)
         {
            return _loc7_ + " " + _loc2_[_loc3_.month] + " " + _loc3_.date + " " + _loc3_.fullYear;
         }
         if(_loc6_ >= 1)
         {
            return _loc7_ + " " + _loc2_[_loc3_.month] + " " + _loc3_.date + " (" + _loc6_ + (_loc6_ == 1 ? " day ago)" : " days ago)");
         }
         if(_loc5_ >= 1)
         {
            return _loc7_ + " (" + _loc5_ + (_loc5_ == 1 ? " hour ago)" : " hours ago)");
         }
         if(_loc4_ >= 1)
         {
            return _loc7_ + " (" + _loc4_ + (_loc4_ == 1 ? " minute ago)" : " minutes ago)");
         }
         return _loc7_ + " (just now)";
      }
      
      public static function setTheme(param1:String) : void
      {
         var _loc2_:URLRequest = new URLRequest(gMainFrame.clientInfo.websiteURL + "api/theme");
         _loc2_.method = "POST";
         _loc2_.contentType = "application/json";
         _loc2_.data = JSON.stringify({
            "username":gMainFrame.server.userName,
            "token":gMainFrame.clientInfo.authToken,
            "theme":param1
         });
         var _loc3_:URLLoader = new URLLoader();
         _loc3_.addEventListener("ioError",onThemeFailed);
         _loc3_.addEventListener("securityError",onThemeFailed);
         _loc3_.load(_loc2_);
      }
      
      // " (have 2)" after the name of a shop item the player owns already.
      public static function ownedSuffix(param1:Object) : String
      {
         var _loc2_:int = 0;
         var _loc3_:int = 0;
         var _loc4_:Object = null;
         try
         {
            if(param1 is Item)
            {
               _loc4_ = gMainFrame.userInfo.playerAvatarInfo.getFullItems();
               while(_loc3_ < _loc4_.length)
               {
                  if(_loc4_.getAccItem(_loc3_).defId == param1.defId)
                  {
                     _loc2_++;
                  }
                  _loc3_++;
               }
            }
            else if(param1 is DenItem)
            {
               _loc4_ = AvatarManager.playerAvatar.inventoryDenFull.denItemCollection;
               while(_loc3_ < _loc4_.length)
               {
                  if(_loc4_.getDenItem(_loc3_).defId == param1.defId)
                  {
                     _loc2_++;
                  }
                  _loc3_++;
               }
            }
         }
         catch(e:Error)
         {
            return "";
         }
         return _loc2_ > 0 ? " (have " + _loc2_ + ")" : "";
      }
      
      // "xls" from the server: when each offline buddy was last seen, for
      // the buddy list's rows. [.., .., count, (username, seconds)...]
      private static var _lastSeen:Object = {};
      
      public static function noteLastSeen(param1:Object) : void
      {
         var _loc2_:int = int(param1[2]);
         var _loc3_:int = 0;
         _lastSeen = {};
         while(_loc3_ < _loc2_)
         {
            _lastSeen[String(param1[3 + _loc3_ * 2]).toLowerCase()] = int(param1[4 + _loc3_ * 2]);
            _loc3_++;
         }
      }
      
      // " (5m)", " (3h)", " (12d)", " (Jan 2025)" after an offline buddy's
      // name; nothing when it is not known.
      public static function lastSeenShort(param1:String) : String
      {
         var _loc2_:Array = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
         var _loc3_:int = int(_lastSeen[param1.toLowerCase()]);
         var _loc4_:Date = new Date(_loc3_ * 1000);
         var _loc5_:Number = Math.max(0,Math.floor((new Date().time - _loc4_.time) / 60000));
         if(_loc3_ < 100000)
         {
            return "";
         }
         if(_loc5_ < 60)
         {
            return " (" + Math.max(1,_loc5_) + "m)";
         }
         if(_loc5_ < 1440)
         {
            return " (" + int(_loc5_ / 60) + "h)";
         }
         if(_loc5_ < 43200)
         {
            return " (" + int(_loc5_ / 1440) + "d)";
         }
         return " (" + _loc2_[_loc4_.month] + " " + _loc4_.fullYear + ")";
      }
      
      // "Joined Oct 2026", for the label on a player's card.
      public static function joinedText(param1:int) : String
      {
         var _loc2_:Array = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
         var _loc3_:Date = new Date(param1 * 1000);
         return param1 > 100000 ? "Joined " + _loc2_[_loc3_.month] + " " + _loc3_.fullYear : "";
      }
      
      // is the game's own font there to be used in a text field made here?
      public static function hasGameFont() : Boolean
      {
         for each(var _loc1_:Font in Font.enumerateFonts(false))
         {
            if(_loc1_.fontName == "CCDigitalDelivery")
            {
               return true;
            }
         }
         return false;
      }
      
      // an oval label: white text in the game's font on a colour, with a
      // darker edge, and room on the left for an icon when param4 is set.
      // used for "Banned" and "Joined" on player cards and for buttons the
      // artwork has none for.
      public static function makePill(param1:String, param2:uint, param3:uint, param4:Boolean = false, param5:int = 12) : Sprite
      {
         var _loc6_:Sprite = new Sprite();
         var _loc7_:TextField = new TextField();
         var _loc8_:int = param5 + 10;
         var _loc9_:Number = 0;
         _loc7_.embedFonts = hasGameFont();
         _loc7_.selectable = false;
         _loc7_.mouseEnabled = false;
         _loc7_.autoSize = "left";
         _loc7_.defaultTextFormat = new TextFormat("CCDigitalDelivery",param5,16777215,true);
         _loc7_.text = param1;
         _loc7_.name = "txt";
         _loc7_.x = param4 ? _loc8_ + 6 : 10;
         _loc7_.y = int((_loc8_ - _loc7_.height) * 0.5);
         _loc9_ = _loc7_.x + _loc7_.width + 9;
         _loc6_.graphics.lineStyle(2,param3);
         _loc6_.graphics.beginFill(param2);
         _loc6_.graphics.drawRoundRect(0,0,_loc9_,_loc8_,_loc8_,_loc8_);
         _loc6_.graphics.endFill();
         _loc6_.addChild(_loc7_);
         _loc6_.mouseChildren = false;
         return _loc6_;
      }
      
      // "xdi": [.., .., kind, rows as JSON]. items the staff made while the
      // game runs (the server's lib/customitems.js): "clothing" or "den" def
      // rows, as in the item packs, each with its name.
      public static function onItemDefs(param1:Object) : void
      {
         try
         {
            var _loc2_:Array = JSON.parse(String(param1[3])) as Array;
            for each(var _loc3_:Object in _loc2_)
            {
               // a picture of its own (uploaded by its maker): its version
               if(_loc3_.art)
               {
                  _customArt[String(param1[2]) + ":" + _loc3_.id] = String(_loc3_.art);
                  _customArtMode[String(param1[2]) + ":" + _loc3_.id] = _loc3_.artMode == "texture" ? "texture" : "sticker";
               }
               else
               {
                  delete _customArt[String(param1[2]) + ":" + _loc3_.id];
                  delete _customArtMode[String(param1[2]) + ":" + _loc3_.id];
               }
            }
            if(String(param1[2]) == "den")
            {
               DenXtCommManager.addDenItemDefs(_loc2_);
            }
            else
            {
               ItemXtCommManager.addItemDefs(_loc2_);
            }
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("item defs: " + e + "\n" + e.getStackTrace());
         }
      }

      // custom items' own pictures (lib/itemart.js on the server): "kind:id"
      // -> version, from the def rows ("xdi"). the picture stands in for the
      // item's icon, and for a den item also for the item placed in a den.
      private static var _customArt:Object = {};

      // how a custom clothing item with a picture is worn ("artMode" in its
      // def row): "sticker", the picture itself where the item would be, or
      // "texture", the item's own shape painted with the picture.
      private static var _customArtMode:Object = {};

      // the pictures as bitmaps, for wearing: "kind:id" -> {bmp, art, waiting}
      private static var _artBitmaps:Object = {};

      // "Custom pictures" in the settings menu (gui.ItemWindowToggle): the
      // pictures players give their items, shown (the default) or not, when
      // every item is drawn with its base's art. user var 9006, 1 for hidden.
      public static function customArtOn() : Boolean
      {
         return settingOf(9006) != 1;
      }

      // the pet chooser's "play as your pet" switch (gui.PetInventory): the
      // pet that is out stands in for the avatar in any room. user var 9008,
      // which the server also reads to show the pet form to everyone.
      public static function petFormOn() : Boolean
      {
         return settingOf(9008) == 1;
      }

      // an item's picture version, or null for none or with them hidden
      private static function artOf(param1:String, param2:int) : String
      {
         return customArtOn() ? _customArt[param1 + ":" + param2] : null;
      }

      // the look a worn item has, or null for one drawn as the game draws it
      public static function customArtMode(param1:String, param2:int) : String
      {
         return artOf(param1,param2) == null ? null : _customArtMode[param1 + ":" + param2];
      }

      // what makes a painted frame of it different from its base's, for a
      // cache key ("" for none)
      public static function customArtKey(param1:String, param2:int) : String
      {
         var _loc3_:String = artOf(param1,param2);
         return _loc3_ == null ? "" : param2 + ":" + _loc3_ + ":" + _customArtMode[param1 + ":" + param2];
      }

      // the picture as a bitmap, or null while it loads (then `param3`, an
      // object with invalidate(), is told when it has: it paints again).
      public static function customArtBitmap(param1:String, param2:int, param3:Object = null) : BitmapData
      {
         var _loc4_:String = param1 + ":" + param2;
         var _loc5_:String = artOf(param1,param2);
         var _loc6_:Object = _artBitmaps[_loc4_];
         if(_loc5_ == null)
         {
            return null;
         }
         if(_loc6_ != null && _loc6_.art == _loc5_)
         {
            if(_loc6_.bmp == null && param3 != null && _loc6_.waiting.indexOf(param3) == -1)
            {
               _loc6_.waiting.push(param3);
            }
            return _loc6_.bmp;
         }
         _loc6_ = _artBitmaps[_loc4_] = {"bmp":null,"art":_loc5_,"waiting":param3 != null ? [param3] : []};
         var _loc7_:Loader = new Loader();
         var _loc8_:Object = _loc6_;
         _loc7_.contentLoaderInfo.addEventListener("complete",function(param1:Event):void
         {
            if(_loc7_.content is Bitmap)
            {
               _loc8_.bmp = Bitmap(_loc7_.content).bitmapData;
            }
            for each(var _loc2_:Object in _loc8_.waiting)
            {
               try
               {
                  if("artArrived" in _loc2_)
                  {
                     _loc2_.artArrived();
                  }
                  else
                  {
                     _loc2_.invalidate();
                  }
               }
               catch(e:Error)
               {
               }
            }
            _loc8_.waiting = [];
         });
         _loc7_.contentLoaderInfo.addEventListener("ioError",function(param1:Event):void
         {
            _loc8_.waiting = [];
         });
         // its pixels are read (worn as a sticker or a texture): from another
         // address that takes the server's /crossdomain.xml
         _loc7_.load(new URLRequest(customArtUrl(param1,param2)),new LoaderContext(true));
         return null;
      }

      // the picture's address, or null when the item has none.
      public static function customArtUrl(param1:String, param2:int) : String
      {
         var _loc3_:String = artOf(param1,param2);
         return _loc3_ == null ? null : gMainFrame.clientInfo.websiteURL + "itemart/" + param1 + "/" + param2 + ".png?v=" + encodeURIComponent(_loc3_);
      }

      // loads a picture into `param2`, fitted in a `param3` square: centred on
      // its origin, or (`param4`) standing on it, as a den item does. then
      // `param5`, if any. a picture that does not load leaves it empty.
      // pictures loadArt has loaded, by address, drawn again from these
      // rather than fetched and decoded again: emoji in chat bubbles, items'
      // icons in long lists. those asked for while one loads wait for it.
      // past ART_CACHE_MAX pictures it starts afresh (a picture shown keeps
      // its own).
      private static const ART_CACHE_MAX:int = 400;

      private static var _artCache:Object = {};

      private static var _artCacheCount:int = 0;

      private static var _artLoading:Object = {};

      public static function loadArt(param1:String, param2:Sprite, param3:int, param4:Boolean, param5:Function = null) : void
      {
         var url:String = param1;
         var place:Function = function(param1:BitmapData):void
         {
            var _loc2_:Bitmap = null;
            var _loc3_:Number = NaN;
            if(param1 != null)
            {
               _loc2_ = new Bitmap(param1,"auto",true);
               _loc3_ = Math.min(1,param3 / Math.max(1,param1.width),param3 / Math.max(1,param1.height));
               _loc2_.scaleX = _loc2_.scaleY = _loc3_;
               _loc2_.x = -int(param1.width * _loc3_ * 0.5);
               _loc2_.y = param4 ? -int(param1.height * _loc3_) : -int(param1.height * _loc3_ * 0.5);
               param2.addChild(_loc2_);
            }
            if(param5 != null)
            {
               param5();
            }
         };
         if(_artCache[url] != null)
         {
            place(_artCache[url]);
            return;
         }
         if(_artLoading[url] != null)
         {
            _artLoading[url].push({"place":place,"sprite":param2,"side":param3,"standing":param4,"then":param5});
            return;
         }
         _artLoading[url] = [];
         var shared:Loader = new Loader();
         var loaded:Function = function(param1:Event):void
         {
            var _loc2_:BitmapData = null;
            var _loc3_:Array = _artLoading[url];
            shared.contentLoaderInfo.removeEventListener("complete",loaded);
            shared.contentLoaderInfo.removeEventListener("ioError",notLoaded);
            delete _artLoading[url];
            try
            {
               _loc2_ = shared.content is Bitmap ? Bitmap(shared.content).bitmapData : null;
            }
            catch(e:Error)
            {
               _loc2_ = null;
            }
            if(_loc2_ == null)
            {
               // not to be shared (another site's, without its leave): each
               // has a loader of its own, as before
               loadArtUncached(url,param2,param3,param4,param5);
               for each(var _loc4_:Object in _loc3_)
               {
                  loadArtUncached(url,_loc4_.sprite,_loc4_.side,_loc4_.standing,_loc4_.then);
               }
               return;
            }
            if(_artCacheCount >= ART_CACHE_MAX)
            {
               _artCache = {};
               _artCacheCount = 0;
            }
            _artCache[url] = _loc2_;
            _artCacheCount++;
            place(_loc2_);
            for each(var _loc5_:Object in _loc3_)
            {
               _loc5_.place(_loc2_);
            }
         };
         var notLoaded:Function = function(param1:Event):void
         {
            var _loc2_:Array = _artLoading[url];
            shared.contentLoaderInfo.removeEventListener("complete",loaded);
            shared.contentLoaderInfo.removeEventListener("ioError",notLoaded);
            delete _artLoading[url];
            place(null);
            for each(var _loc3_:Object in _loc2_)
            {
               _loc3_.place(null);
            }
         };
         shared.contentLoaderInfo.addEventListener("complete",loaded);
         shared.contentLoaderInfo.addEventListener("ioError",notLoaded);
         shared.load(new URLRequest(url),new LoaderContext(true));
      }

      private static function loadArtUncached(param1:String, param2:Sprite, param3:int, param4:Boolean, param5:Function = null) : void
      {
         var _loc6_:Loader = new Loader();
         var done:Function = function(param1:Event):void
         {
            var _loc2_:Number = NaN;
            _loc6_.contentLoaderInfo.removeEventListener("complete",done);
            _loc6_.contentLoaderInfo.removeEventListener("ioError",failed);
            if(_loc6_.content is Bitmap)
            {
               Bitmap(_loc6_.content).smoothing = true;
            }
            _loc2_ = Math.min(1,param3 / Math.max(1,_loc6_.contentLoaderInfo.width),param3 / Math.max(1,_loc6_.contentLoaderInfo.height));
            _loc6_.scaleX = _loc6_.scaleY = _loc2_;
            _loc6_.x = -int(_loc6_.contentLoaderInfo.width * _loc2_ * 0.5);
            _loc6_.y = param4 ? -int(_loc6_.contentLoaderInfo.height * _loc2_) : -int(_loc6_.contentLoaderInfo.height * _loc2_ * 0.5);
            param2.addChild(_loc6_);
            if(param5 != null)
            {
               param5();
            }
         };
         var failed:Function = function(param1:Event):void
         {
            _loc6_.contentLoaderInfo.removeEventListener("complete",done);
            _loc6_.contentLoaderInfo.removeEventListener("ioError",failed);
            if(param5 != null)
            {
               param5();
            }
         };
         _loc6_.contentLoaderInfo.addEventListener("complete",done);
         _loc6_.contentLoaderInfo.addEventListener("ioError",failed);
         _loc6_.load(new URLRequest(param1));
      }

      // "xsp": [.., .., role, permissions]. sent at login to staff only: their
      // role and what it allows, comma separated (the server's lib/roles.js).
      public static function onStaff(param1:Object) : void
      {
         staffRole = String(param1[2]);
         staffPermissions = String(param1[3]).length > 0 ? String(param1[3]).split(",") : [];
         if(_toolsInstance != null)
         {
            _toolsInstance.placeTheatreButton();
         }
      }

      // "xui": a permission-checked server command asks for a staff panel.
      // It is never acted on merely because a browser or another player asks.
      public static function onStaffUi(param1:Object) : void
      {
         if(_toolsInstance == null)
         {
            return;
         }
         var _loc1_:String = param1.length > 2 ? String(param1[2]) : "";
         if(_loc1_ == "moderate" && param1.length > 3 && canModerate())
         {
            openModerate(String(param1[3]));
         }
         else if(_loc1_ == "event" && staffMay("room.effects"))
         {
            _toolsInstance.openRoomControl();
         }
      }

      // "xtv": a server-authorized YouTube id for this theatre, or empty to
      // stop it. The desktop game's web page owns the actual iframe.
      public static function onTheatreVideo(param1:Object) : void
      {
         try
         {
            if(ExternalInterface.available)
            {
               ExternalInterface.call("ajTheatreVideo",param1.length > 2 ? String(param1[2]) : "");
            }
         }
         catch(e:Error)
         {
         }
      }

      private function placeTheatreButton() : void
      {
         // Video playback belongs to the theatre's own VIDEOS sign. A HUD
         // button existed in every room and den for staff, which was both
         // misleading and able to cover other interfaces.
         if(_theatreButton != null)
         {
            _theatreButton.visible = false;
         }
      }

      private function onTheatreButton(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_theatreControl == null)
         {
            buildTheatreControl();
         }
         _theatreControl.visible = !_theatreControl.visible;
         if(_theatreControl.visible)
         {
            setChildIndex(_theatreControl,numChildren - 1);
            gMainFrame.stage.focus = _theatreInput;
         }
      }

      // Called by the theatre's VIDEOS sign through game.html.  This needs to
      // remain public for ExternalInterface, but permission is still derived
      // from the signed-in server role, never from the browser call.
      public function openTheatreControl() : void
      {
         if(!staffMay("theater.control"))
         {
            return;
         }
         if(_theatreControl == null)
         {
            buildTheatreControl();
         }
         placeTheatreBox();
         _theatreControl.visible = true;
         setChildIndex(_theatreControl,numChildren - 1);
         gMainFrame.stage.focus = _theatreInput;
         _theatreInput.setSelection(0,_theatreInput.length);
      }

      // the Room Video box over the middle of the theatre's screen, as the
      // page's Your Video box sits (game.html), or the stage's middle
      private function placeTheatreBox() : void
      {
         var _loc1_:DisplayObject = _theatreControl.getChildByName("box");
         var _loc2_:Object = RoomManagerWorld.instance != null ? RoomManagerWorld.instance.theaterWindow : null;
         var _loc3_:DisplayObject = _loc2_ != null && _loc2_.hasOwnProperty("videoLayer") ? _loc2_.videoLayer as DisplayObject : null;
         var _loc4_:Point = null;
         var _loc5_:Point = null;
         _loc1_.x = int((900 - THEATRE_BOX_W) * 0.5);
         _loc1_.y = int((550 - THEATRE_BOX_H) * 0.5);
         try
         {
            if(_loc3_ != null && shownOnStage(_loc3_))
            {
               _loc4_ = _theatreControl.globalToLocal(_loc3_.localToGlobal(new Point(0,0)));
               _loc5_ = _theatreControl.globalToLocal(_loc3_.localToGlobal(new Point(THEATRE_SCREEN_W,THEATRE_SCREEN_H)));
               _loc1_.x = int(_loc4_.x + (_loc5_.x - _loc4_.x - THEATRE_BOX_W) * 0.5);
               _loc1_.y = int(Math.max(4,_loc4_.y + (_loc5_.y - _loc4_.y - THEATRE_BOX_H) * 0.5));
            }
         }
         catch(e:Error)
         {
         }
      }

      // the staff's Room Video box, drawn as the page's Your Video box
      // (game.html .aj-box): a cream panel with a brown edge, a white title
      // outlined in brown, a white link box, green and red pill buttons and
      // a red round close button. behind it the whole stage, unseen, so a
      // click past it does nothing in the room.
      private static const THEATRE_BOX_W:int = 360;
      private static const THEATRE_BOX_H:int = 150;

      private function buildTheatreControl() : void
      {
         _theatreControl = new Sprite();
         _theatreControl.graphics.beginFill(0,0);
         _theatreControl.graphics.drawRect(0,0,900,550);
         _theatreControl.graphics.endFill();
         var _loc1_:Sprite = new Sprite();
         _loc1_.name = "box";
         _loc1_.graphics.beginFill(0,0.35);
         _loc1_.graphics.drawRoundRect(0,4,THEATRE_BOX_W,THEATRE_BOX_H,36,36);
         _loc1_.graphics.endFill();
         _loc1_.graphics.lineStyle(4,0x7F6744);
         _loc1_.graphics.beginFill(0xFFF2C4);
         _loc1_.graphics.drawRoundRect(0,0,THEATRE_BOX_W,THEATRE_BOX_H,36,36);
         _loc1_.graphics.endFill();
         _loc1_.graphics.lineStyle(2,0xFFE39A);
         _loc1_.graphics.drawRoundRect(3,3,THEATRE_BOX_W - 6,THEATRE_BOX_H - 6,30,30);
         _theatreControl.addChild(_loc1_);
         var _loc2_:TextField = modText("Room Video",20,0xFFFFFF);
         _loc2_.filters = [new GlowFilter(0x6D4330,1,4,4,12)];
         _loc2_.x = 16;
         _loc2_.y = 12;
         _loc1_.addChild(_loc2_);
         var _loc3_:TextField = modText("Everyone in this theatre sees it.",12,0x8A6A45,false);
         _loc3_.x = 17;
         _loc3_.y = 41;
         _loc1_.addChild(_loc3_);
         var _loc4_:Sprite = new Sprite();
         _loc4_.x = 16;
         _loc4_.y = 62;
         _loc4_.graphics.lineStyle(2,0xC9A86A);
         _loc4_.graphics.beginFill(0xFFFFFF);
         _loc4_.graphics.drawRoundRect(0,0,THEATRE_BOX_W - 32,30,18,18);
         _loc4_.graphics.endFill();
         _loc1_.addChild(_loc4_);
         var _loc5_:TextField = new TextField();
         _loc5_.selectable = false;
         _loc5_.mouseEnabled = false;
         _loc5_.defaultTextFormat = new TextFormat("Arial",13,0xA88F6A);
         _loc5_.text = "Paste a YouTube link";
         _loc5_.x = 9;
         _loc5_.y = 6;
         _loc5_.width = THEATRE_BOX_W - 50;
         _loc5_.height = 20;
         _loc4_.addChild(_loc5_);
         _theatreInput = new TextField();
         _theatreInput.type = "input";
         _theatreInput.defaultTextFormat = new TextFormat("Arial",13,0x3D2716);
         _theatreInput.maxChars = 200;
         _theatreInput.x = 9;
         _theatreInput.y = 6;
         _theatreInput.width = THEATRE_BOX_W - 50;
         _theatreInput.height = 20;
         _loc4_.addChild(_theatreInput);
         _theatreInput.addEventListener("change",function(param1:Event):void
         {
            _loc5_.visible = _theatreInput.length == 0;
         });
         _theatreInput.addEventListener("keyDown",onTheatreKey,false,0,true);
         theatreControlButton(_loc1_,"play","Play for room",55,104,150,0xA6E05A,0x4FA52F,0x2F7420);
         theatreControlButton(_loc1_,"stop","Stop",215,104,90,0xF59A6A,0xD4482A,0x8E2B16);
         var _loc6_:Sprite = new Sprite();
         _loc6_.buttonMode = true;
         _loc6_.useHandCursor = true;
         _loc6_.graphics.beginFill(0x7F6744);
         _loc6_.graphics.drawCircle(0,0,17);
         _loc6_.graphics.beginFill(0xFFFFFF);
         _loc6_.graphics.drawCircle(0,0,15);
         _loc6_.graphics.beginFill(0xD9452A);
         _loc6_.graphics.drawCircle(0,0,12);
         _loc6_.graphics.endFill();
         _loc6_.graphics.lineStyle(2.5,0xFFFFFF);
         _loc6_.graphics.moveTo(-4.5,-4.5);
         _loc6_.graphics.lineTo(4.5,4.5);
         _loc6_.graphics.moveTo(4.5,-4.5);
         _loc6_.graphics.lineTo(-4.5,4.5);
         _loc6_.x = THEATRE_BOX_W - 5;
         _loc6_.y = 5;
         _loc6_.addEventListener("mouseDown",onTheatreClose,false,0,true);
         _loc1_.addChild(_loc6_);
         _theatreControl.addEventListener("mouseDown",onFinderMouse);
         _theatreControl.addEventListener("mouseUp",onFinderMouse);
         _theatreControl.addEventListener("click",onFinderMouse);
         _theatreControl.visible = false;
         addChild(_theatreControl);
      }

      // a pill button of the page's .aj-button: a gradient from `param6` to
      // `param7` with a `param8` edge and a step of it underneath
      private function theatreControlButton(param1:Sprite, param2:String, param3:String, param4:Number, param5:Number, param6:Number, param7:uint, param8:uint, param9:uint) : void
      {
         var _loc1_:Sprite = new Sprite();
         var _loc2_:Matrix = new Matrix();
         _loc1_.name = param2;
         _loc1_.x = param4;
         _loc1_.y = param5;
         _loc1_.buttonMode = true;
         _loc1_.useHandCursor = true;
         _loc1_.mouseChildren = false;
         _loc2_.createGradientBox(param6,32,Math.PI / 2);
         _loc1_.graphics.beginFill(param9);
         _loc1_.graphics.drawRoundRect(0,2,param6,32,32,32);
         _loc1_.graphics.endFill();
         _loc1_.graphics.lineStyle(2,param9);
         _loc1_.graphics.beginGradientFill("linear",[param7,param8],[1,1],[0,255],_loc2_);
         _loc1_.graphics.drawRoundRect(0,0,param6,32,32,32);
         _loc1_.graphics.endFill();
         _loc1_.graphics.lineStyle(2,0xFFFFFF,0.45);
         _loc1_.graphics.moveTo(14,3);
         _loc1_.graphics.lineTo(param6 - 14,3);
         var _loc3_:TextField = modText(param3,15,0xFFFFFF);
         _loc3_.filters = [new DropShadowFilter(1.5,90,0,0.45,0,0,1)];
         _loc3_.x = int((param6 - _loc3_.width) * 0.5);
         _loc3_.y = int((32 - _loc3_.height) * 0.5);
         _loc1_.addChild(_loc3_);
         _loc1_.addEventListener("mouseDown",onTheatreControl,false,0,true);
         _loc1_.addEventListener("mouseOver",onFlatHover);
         _loc1_.addEventListener("mouseOut",onFlatHover);
         param1.addChild(_loc1_);
      }

      // Enter plays, Escape closes, as in the page's box
      private function onTheatreKey(param1:KeyboardEvent) : void
      {
         if(param1.keyCode == 13)
         {
            sendTheatreVideo("play");
         }
         else if(param1.keyCode == 27)
         {
            _theatreControl.visible = false;
            gMainFrame.stage.focus = null;
         }
      }

      private function onTheatreControl(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         sendTheatreVideo(Sprite(param1.currentTarget).name);
      }

      private function sendTheatreVideo(param1:String) : void
      {
         if(param1 == "play" && _theatreInput.text.replace(/^\s+|\s+$/g,"").length == 0)
         {
            gMainFrame.stage.focus = _theatreInput;
            return;
         }
         gMainFrame.server.setXtObject_Str("xtv",[param1,param1 == "play" ? _theatreInput.text.split("%").join("") : ""]);
         _theatreControl.visible = false;
         gMainFrame.stage.focus = null;
      }

      private function openRoomControl() : void
      {
         if(!staffMay("room.effects"))
         {
            return;
         }
         if(_roomControl == null)
         {
            buildRoomControl();
         }
         _roomControl.visible = true;
         setChildIndex(_roomControl,numChildren - 1);
      }

      private function buildRoomControl() : void
      {
         _roomControl = new Sprite();
         _roomControl.graphics.beginFill(0,0.55);
         _roomControl.graphics.drawRect(0,0,900,550);
         _roomControl.graphics.endFill();
         var _loc1_:Sprite = new Sprite();
         _loc1_.x = 225;
         _loc1_.y = 150;
         _loc1_.graphics.lineStyle(2,0x7B4D24);
         _loc1_.graphics.beginFill(0x27221D);
         _loc1_.graphics.drawRoundRect(0,0,450,250,22,22);
         _loc1_.graphics.endFill();
         _roomControl.addChild(_loc1_);
         theatreCloseButton(_loc1_);
         var _loc2_:TextField = modText("HOST / EVENT CONTROLS",22,0xFFFFFF);
         _loc2_.x = 24;
         _loc2_.y = 22;
         _loc1_.addChild(_loc2_);
         var _loc3_:TextField = modText("Change the whole room. Clear resets size and colour.",12,0xD5C5AE,false);
         _loc3_.x = 24;
         _loc3_.y = 58;
         _loc1_.addChild(_loc3_);
         roomControlButton(_loc1_,"small","Make everyone small",24,98,126,0x357A45);
         roomControlButton(_loc1_,"normal","Normal size",162,98,126,0x496B91);
         roomControlButton(_loc1_,"big","Make everyone big",300,98,126,0x7A5FBD);
         roomControlButton(_loc1_,"rainbow","Rainbow room",24,150,196,0xA54E96);
         roomControlButton(_loc1_,"clear","Clear effects",230,150,196,0x8E3D3D);
         _roomControl.addEventListener("mouseDown",onFinderMouse);
         _roomControl.addEventListener("mouseUp",onFinderMouse);
         _roomControl.addEventListener("click",onFinderMouse);
         _roomControl.visible = false;
         addChild(_roomControl);
      }

      private function roomControlButton(param1:Sprite, param2:String, param3:String, param4:Number, param5:Number, param6:Number, param7:uint) : void
      {
         var _loc1_:Sprite = new Sprite();
         _loc1_.name = param2;
         _loc1_.x = param4;
         _loc1_.y = param5;
         _loc1_.buttonMode = true;
         _loc1_.useHandCursor = true;
         _loc1_.mouseChildren = false;
         var _loc2_:TextField = modText(param3,12,0xFFFFFF);
         _loc2_.name = "label";
         _loc1_.addChild(_loc2_);
         paintFlatButton(_loc1_,param6,param7);
         _loc1_.addEventListener("mouseDown",onRoomControl,false,0,true);
         param1.addChild(_loc1_);
      }

      private function onRoomControl(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         gMainFrame.server.setXtObject_Str("xrc",[Sprite(param1.currentTarget).name]);
         _roomControl.visible = false;
      }

      // A visible close control is reliable even while an input field owns
      // keyboard focus, unlike relying only on Escape.
      private function theatreCloseButton(param1:Sprite) : void
      {
         var _loc1_:Sprite = new Sprite();
         _loc1_.buttonMode = true;
         _loc1_.useHandCursor = true;
         _loc1_.graphics.beginFill(MOD_GREY);
         _loc1_.graphics.drawCircle(0,0,13);
         _loc1_.graphics.endFill();
         _loc1_.graphics.lineStyle(2,0xFFFFFF);
         _loc1_.graphics.moveTo(-4,-4);
         _loc1_.graphics.lineTo(4,4);
         _loc1_.graphics.moveTo(4,-4);
         _loc1_.graphics.lineTo(-4,4);
         _loc1_.x = 422;
         _loc1_.y = 25;
         _loc1_.addEventListener("mouseDown",onTheatreClose,false,0,true);
         param1.addChild(_loc1_);
      }

      private function onTheatreClose(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_theatreControl != null)
         {
            _theatreControl.visible = false;
         }
         if(_roomControl != null)
         {
            _roomControl.visible = false;
         }
         gMainFrame.stage.focus = null;
      }

      public static function staffMay(param1:String) : Boolean
      {
         return staffPermissions.indexOf(param1) != -1;
      }

      // whether a player's card offers the staff's window instead of a report.
      public static function canModerate() : Boolean
      {
         return _toolsInstance != null && (staffMay("player.warn") || staffMay("player.kick") || staffMay("chat.silence") || staffMay("player.summon") || staffMay("player.goto"));
      }

      public static function openModerate(param1:String) : void
      {
         if(_toolsInstance == null)
         {
            return;
         }
         try
         {
            _toolsInstance.showModerate(param1);
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("moderate: " + e + "\n" + e.getStackTrace());
         }
      }

      // "xtl": [.., .., text]. A plain message box; what a chat command says.
      public static function showMessage(param1:Object) : void
      {
         new SBOkPopup(GuiManager.guiLayer,String(param1[2]));
      }
      
      // "xgt": [.., .., x, y, same room]: staff moving a player (summon,
      // goto) puts them on that spot: now when in the room already ("1"),
      // else on spawning in the room they are sent to next ("0"). with no
      // spot, the one kept is forgotten (the move failed).
      public static function onStaffGoto(param1:Object) : void
      {
         var _loc2_:RoomManagerWorld = RoomManagerWorld.instance;
         if(_loc2_ == null)
         {
            return;
         }
         if(param1.length < 5)
         {
            _loc2_.setGotoSpawnPoint("default");
            return;
         }
         if(String(param1[4]) == "1")
         {
            _loc2_.teleportPlayer(int(param1[2]),int(param1[3]),true);
         }
         else
         {
            _loc2_.setGotoSpawnLocation(int(param1[2]),int(param1[3]));
         }
      }

      // whether this player is invisible staff (lib/world.js setInvisible),
      // for the staff window's button.
      public static var staffInvisible:Boolean = false;

      // "xiv": [.., .., sfsId, 1 | 0]: an animal of invisible staff, which
      // only staff are shown, drawn half see-through (this player's own too).
      public static function onInvisible(param1:Object) : void
      {
         var _loc2_:int = int(param1[2]);
         var _loc3_:Boolean = String(param1[3]) == "1";
         var _loc4_:AvatarWorldView = AvatarManager.avatarViewList != null ? AvatarManager.avatarViewList[_loc2_] as AvatarWorldView : null;
         if(_loc2_ == AvatarManager.playerSfsUserId)
         {
            staffInvisible = _loc3_;
         }
         if(_loc4_ != null)
         {
            _loc4_.alpha = _loc3_ ? 0.5 : 1;
         }
      }

      // typing (lib/world.js xty): this player's chat box says so as it
      // changes (gui.ChatHistory), again every TYPING_RESEND ms while it goes
      // on, and once when it is emptied; a line sent counts as stopping.
      private static const TYPING_RESEND:int = 4000;

      private static var _typingSent:Boolean = false;

      private static var _typingSentAt:int = 0;

      public static function noteTyping(param1:String) : void
      {
         var _loc2_:Boolean = param1 != null && param1.replace(/\s+/g,"").length > 0;
         if(gMainFrame.clientInfo.invisMode || staffInvisible)
         {
            return;
         }
         if(_loc2_ && (!_typingSent || getTimer() - _typingSentAt > TYPING_RESEND))
         {
            gMainFrame.server.setXtObject_Str("xty",[1]);
            _typingSent = true;
            _typingSentAt = getTimer();
         }
         else if(!_loc2_ && _typingSent)
         {
            gMainFrame.server.setXtObject_Str("xty",[0]);
            _typingSent = false;
         }
      }

      // a line was sent: every other game drops the "..." when it arrives.
      public static function typingSent() : void
      {
         _typingSent = false;
      }

      // "xty": [.., .., sfsId, 1 | 0]: another player typing, or not.
      public static function onTyping(param1:Object) : void
      {
         var _loc2_:AvatarWorldView = AvatarManager.avatarViewList != null ? AvatarManager.avatarViewList[int(param1[2])] as AvatarWorldView : null;
         if(_loc2_ != null && int(param1[2]) != AvatarManager.playerSfsUserId)
         {
            _loc2_.setTyping(String(param1[3]) == "1");
         }
      }

      // "xtr": [.., .., sfsId, 1 | 0]: another player trading, or not
      // (lib/world.js showTrading).
      public static function onTrading(param1:Object) : void
      {
         var _loc2_:AvatarWorldView = AvatarManager.avatarViewList != null ? AvatarManager.avatarViewList[int(param1[2])] as AvatarWorldView : null;
         if(_loc2_ != null)
         {
            _loc2_.setTrading(String(param1[3]) == "1");
         }
      }

      // "xyn": [.., .., id, text]. A yes-or-no box; the answer goes back as
      // "xyn" [id, 1 | 0].
      public static function askYesNo(param1:Object) : void
      {
         new SBYesNoPopup(GuiManager.guiLayer,String(param1[3]),true,onYesNo,int(param1[2]));
      }
      
      private static function onYesNo(param1:Object) : void
      {
         gMainFrame.server.setXtObject_Str("xyn",[param1.passback,param1.status ? 1 : 0]);
      }
      
      // "xw": a whisper. [.., .., 1]: the chat line that follows is one, and
      // its bubble is drawn light green (gui.ChatBalloon reads whisperNext).
      // [.., .., 0, from, text]: from another room, so a message box, in
      // the same green.
      public static var whisperNext:Boolean = false;
      
      public static function onWhisper(param1:Object) : void
      {
         var _loc2_:SBOkPopup = null;
         if(String(param1[2]) == "1")
         {
            whisperNext = true;
            return;
         }
         // through the reader's chat filter, as a bubble would be.
         var _loc3_:String = filterText(String(param1[4]));
         if(_loc3_ == null)
         {
            return;
         }
         _loc2_ = new SBOkPopup(GuiManager.guiLayer,String(param1[3]) + " whispers:\n" + _loc3_);
         _loc2_.transform.colorTransform = whisperTint();
      }
      
      public static function whisperTint() : ColorTransform
      {
         return new ColorTransform(0.72,1,0.72,1,0,18,0,0);
      }
      
      private static var _renaming:Dictionary = new Dictionary(true);
      
      private static var _renameField:TextField;
      
      private static var _renameOld:String;
      
      private static var _renameHosts:Dictionary = new Dictionary(true);
      
      private static var _nameDownField:TextField;
      
      private static var _nameDownAt:int;
      
      // makes a name's text field one that a double click turns into a box
      // to type in. param2 is "a" or "p", param3 the animal's perUserAvId or
      // the pet's inventory id; param4, if given, is told the new name once
      // the server has taken it. param5 is what hears the mouse there (the
      // cell or window the name is drawn in: the artwork's text fields hear
      // nothing themselves), so the presses are caught on it, ahead of its
      // own listeners, and those on the name are kept from them.
      public static function makeRenamable(param1:TextField, param2:String, param3:int, param4:Function, param5:DisplayObject) : void
      {
         if(param1 == null || param5 == null)
         {
            return;
         }
         _renaming[param1] = {
            "kind":param2,
            "id":param3,
            "done":param4
         };
         _renameHosts[param5] = param1;
         param5.addEventListener("mouseDown",onRenameHostDown,true,1000,true);
         param5.addEventListener("mouseDown",onRenameHostDown,false,1000,true);
      }
      
      private static function onRenameHostDown(param1:MouseEvent) : void
      {
         var _loc2_:TextField = _renameHosts[param1.currentTarget];
         var _loc3_:int = getTimer();
         if(_loc2_ == null || _loc2_.stage == null || _renaming[_loc2_] == null)
         {
            return;
         }
         if(!_loc2_.getBounds(_loc2_.stage).contains(param1.stageX,param1.stageY))
         {
            if(_renameField == _loc2_)
            {
               endRename(true);
            }
            return;
         }
         param1.stopImmediatePropagation();
         if(_renameField != null)
         {
            return;
         }
         if(_nameDownField == _loc2_ && _loc3_ - _nameDownAt < 500)
         {
            _nameDownField = null;
            startRename(_loc2_);
            return;
         }
         _nameDownField = _loc2_;
         _nameDownAt = _loc3_;
      }
      
      private static function startRename(param1:TextField) : void
      {
         _renameField = param1;
         _renameOld = param1.text;
         param1.type = "input";
         param1.selectable = true;
         param1.mouseEnabled = true;
         param1.maxChars = 20;
         param1.restrict = "A-Za-z0-9 '.\\-";
         param1.addEventListener("keyDown",onRenameKey,false,0,true);
         param1.addEventListener("focusOut",onRenameFocusOut,false,0,true);
         gMainFrame.stage.focus = param1;
         param1.setSelection(0,param1.text.length);
      }
      
      private static function onRenameKey(param1:KeyboardEvent) : void
      {
         param1.stopPropagation();
         if(param1.keyCode == 13)
         {
            endRename(true);
         }
         else if(param1.keyCode == 27)
         {
            endRename(false);
         }
      }
      
      private static function onRenameFocusOut(param1:Event) : void
      {
         endRename(true);
      }
      
      private static function endRename(param1:Boolean) : void
      {
         var _loc2_:TextField = _renameField;
         var _loc3_:Object = null;
         var _loc4_:String = null;
         if(_loc2_ == null)
         {
            return;
         }
         _renameField = null;
         _loc3_ = _renaming[_loc2_];
         _loc4_ = _loc2_.text.replace(/^\s+|\s+$/g,"");
         _loc2_.removeEventListener("keyDown",onRenameKey);
         _loc2_.removeEventListener("focusOut",onRenameFocusOut);
         _loc2_.type = "dynamic";
         _loc2_.selectable = false;
         _loc2_.setSelection(0,0);
         if(gMainFrame.stage.focus == _loc2_)
         {
            gMainFrame.stage.focus = null;
         }
         if(!param1 || _loc3_ == null || _loc4_.length == 0 || _loc4_ == _renameOld)
         {
            _loc2_.text = _renameOld;
            return;
         }
         _loc2_.text = _loc4_;
         _loc3_.old = _renameOld;
         _loc3_.field = _loc2_;
         _pendingRenames[_loc3_.kind + ":" + _loc3_.id] = _loc3_;
         gMainFrame.server.setXtObject_Str("xrn",[_loc3_.kind,_loc3_.id,_loc4_]);
      }
      
      private static var _pendingRenames:Object = {};
      
      // "xrn": [.., .., kind, id, 1 | 0, the name as it now is]
      public static function onRenamed(param1:Object) : void
      {
         var _loc2_:String = String(param1[2]) + ":" + String(param1[3]);
         var _loc3_:Object = _pendingRenames[_loc2_];
         delete _pendingRenames[_loc2_];
         if(_loc3_ == null)
         {
            return;
         }
         if(String(param1[4]) != "1")
         {
            _loc3_.field.text = _loc3_.old;
            new SBOkPopup(GuiManager.guiLayer,"Names are letters, digits and spaces, up to 20 long.");
         }
         else if(_loc3_.done != null)
         {
            _loc3_.done(String(param1[5]));
         }
      }
      
      // ---- items picked several at a time (the item picker, recycling)
      //
      // which items are picked, by kind and inventory id. an item cell
      // (gui.itemWindows.ItemWindowOriginal) draws its green ring from this,
      // so a pick stays shown through scrolling, tabs and searches.
      private static var _picked:Object = {};
      
      public static var pickedCount:int = 0;
      
      public static function pickKey(param1:Object) : String
      {
         return (param1 is Item ? "c" : (param1 is DenItem ? "d" : "p")) + param1.invIdx;
      }
      
      public static function isPicked(param1:Object) : Boolean
      {
         return param1 != null && _picked[pickKey(param1)] != null;
      }
      
      public static function setPicked(param1:Object, param2:Boolean) : void
      {
         var _loc3_:String = pickKey(param1);
         if(param2 && _picked[_loc3_] == null)
         {
            _picked[_loc3_] = param1;
            pickedCount++;
         }
         else if(!param2 && _picked[_loc3_] != null)
         {
            delete _picked[_loc3_];
            pickedCount--;
         }
      }
      
      public static function pickedItems() : Array
      {
         var _loc1_:Array = [];
         for each(var _loc2_:Object in _picked)
         {
            _loc1_.push(_loc2_);
         }
         return _loc1_;
      }
      
      public static function clearPicked() : void
      {
         _picked = {};
         pickedCount = 0;
      }
      
      // ---- the HUD shown or not, from the client's top bar (ajHud in the
      // game's page calls setHudShown). the game shows its HUD again by
      // itself on the way into a room, so while it is to be hidden it is
      // hidden again every frame (onSmoothFrame).
      
      private static var _hudHidden:Boolean;
      
      private static function setHudShown(param1:Boolean) : void
      {
         _hudHidden = !param1;
         try
         {
            if(GuiManager.mainHud == null)
            {
               return;
            }
            if(_hudHidden)
            {
               GuiManager.mainHud.visible = false;
               gMainFrame.stage.focus = null;
            }
            else if(!AvatarManager.isMyAvtInPreviewRoom && !MinigameManager.inMinigame())
            {
               // where the game keeps it hidden itself, it stays so.
               GuiManager.mainHud.visible = true;
            }
         }
         catch(e:Error)
         {
         }
      }
      
      // ---- smooth graphics, and the settings behind it
      //
      // the game draws 24 pictures a second and moves everything once a
      // picture. with "Graphics: Smooth" what the game moves by the clock is
      // also moved between two pictures and the screen drawn again each
      // time: animals that are walking, the camera, and the windows and tabs
      // that slide (GTween). the drawing quality is "high" where the game
      // keeps "medium", and a click or a key is acted on at once. the 24
      // frames themselves are left alone, so nothing that counts frames
      // (animations, the rooms' own artwork, minigames) runs any faster; in
      // a minigame all of this is off.
      //
      // the settings, user vars of this server's own, in the settings menu
      // (gui.itemWindows.ItemWindowToggle):
      //   9003  Graphics: 1 Default (the game as it was: all of it off; not
      //         called "Performance", since it is little lighter on any but
      //         the weakest machine), 2 Smooth; unset is
      //         the server's default (config.smooth: it sends 1 or nothing).
      //   9004  Frame rate: 1 is 60; anything else is Max, as fast as the
      //         timer goes (about 80 a second on the owner's machine, where
      //         the 120 and 144 this once offered came to the same).
      //   9005  Camera: 2 the game's own, else Smooth
      //         (room.RoomManagerWorld.easeCamera).
      //   9007  Performance profile: 1 Low-end, 3 Balanced, else (unset) High:
      //         the best the game can look, which most machines manage. A
      //         profile changes only optional rendering work, never the
      //         game's native 24 FPS (which would slow its animations).
      //   9008  Play as your pet (gui.PetInventory, lib/pets.js): 1 on.
      //   9009  Expanded Inventory (expandedInventoryOn): 1 on.
      //   9010  Items a row with it on: 3, 4 or 5; unset is 5.
      
      
      private static var _smoothTimer:Timer;
      
      private static var _smoothAt:int; // when things were last moved, by a frame or between two
      
      private static var _smoothQuality:Boolean; // the quality is ours at the moment
      
      private static var _smoothBroken:Boolean; // it threw three times: off until the game is started again
      
      private static var _smoothErrors:int;
      
      private static var _drawn:int; // pictures since the count was last told
      
      private static var _drawnSince:int;
      
      private static function settingOf(param1:int) : int
      {
         return int(gMainFrame.userInfo.userVarCache.getUserVarValueById(param1));
      }
      
      public static function smoothOn() : Boolean
      {
         if(performanceProfile() == 1)
         {
            return false;
         }
         if(performanceProfile() == 2)
         {
            return true;
         }
         return settingOf(9003) != 1;
      }

      // 0 Balanced, 1 Low-end, 2 High (kept as 3, 1, and 2 or nothing). It
      // is persisted with the other client settings, so the preference
      // follows the player to another computer.
      public static function performanceProfile() : int
      {
         var _loc1_:int = settingOf(9007);
         return _loc1_ == 1 ? 1 : (_loc1_ == 3 ? 0 : 2);
      }

      public static function performanceProfileLabel() : String
      {
         switch(performanceProfile())
         {
            case 1:
               return "Low-end";
            case 2:
               return "High";
            default:
               return "Balanced";
         }
      }
      
      // pictures a second asked for, or 0 for no limit.
      public static function frameRate() : int
      {
         if(performanceProfile() == 2)
         {
            return 0;
         }
         return settingOf(9004) == 1 ? 60 : 0;
      }
      
      public static function cameraEases() : Boolean
      {
         var _loc1_:Boolean = false;
         try
         {
            _loc1_ = smoothOn() && settingOf(9005) != 2;
         }
         catch(e:Error)
         {
         }
         return _loc1_;
      }
      
      // every frame: whether the extra steps should be running just now, and
      // once a second how many pictures were drawn, for the client's top bar
      // (ajFps in the game's page).
      private function onSmoothFrame(param1:Event) : void
      {
         var _loc2_:Boolean = false;
         var _loc3_:int = getTimer();
         var _loc4_:int = 0;
         _smoothAt = _loc3_;
         _drawn++;
         if(_hudHidden && GuiManager.mainHud != null && GuiManager.mainHud.visible)
         {
            GuiManager.mainHud.visible = false;
         }
         if(_loc3_ - _drawnSince >= 1000)
         {
            try
            {
               if(ExternalInterface.available)
               {
                  ExternalInterface.call("ajFps",Math.round(_drawn * 1000 / (_loc3_ - _drawnSince)));
               }
            }
            catch(e:Error)
            {
            }
            _drawn = 0;
            _drawnSince = _loc3_;
         }
         try
         {
            // Extra interpolation cannot be seen below a modal. The world map
            // is a modal without DarkenManager, so include it here too.
            _loc2_ = !_smoothBroken && MainFrame.isInitialized() && gMainFrame.userInfo != null && gMainFrame.userInfo.userVarCache != null && AvatarManager.playerAvatarWorldView != null && !MinigameManager.inMinigame() && !GuiManager.isModal() && smoothOn();
         }
         catch(e:Error)
         {
            _loc2_ = false;
         }
         if(_loc2_)
         {
            _loc4_ = frameRate() > 0 ? Math.round(1000 / frameRate()) : 1;
            if(_smoothTimer == null)
            {
               _smoothTimer = new Timer(_loc4_);
               _smoothTimer.addEventListener("timer",onSmoothTimer);
            }
            if(_smoothTimer.delay != _loc4_)
            {
               _smoothTimer.delay = _loc4_;
            }
            if(!_smoothTimer.running)
            {
               _smoothTimer.start();
            }
            if(gMainFrame.stage.quality != "HIGH")
            {
               gMainFrame.stage.quality = "high";
            }
            _smoothQuality = true;
         }
         else
         {
            if(_smoothTimer != null && _smoothTimer.running)
            {
               _smoothTimer.stop();
            }
            if(_smoothQuality)
            {
               _smoothQuality = false;
               gMainFrame.stage.quality = gMainFrame.currStageQuality != null ? gMainFrame.currStageQuality : "medium";
            }
         }
         // Low-end uses Flash's lower-quality renderer but keeps the original
         // game framerate, so movement and frame-based animations do not run
         // in slow motion. Restore the game's normal renderer on exit.
         if(performanceProfile() == 1)
         {
            if(gMainFrame.stage.quality != "LOW")
            {
               gMainFrame.stage.quality = "low";
            }
         }
         else if(!_smoothQuality && gMainFrame.stage.quality == "LOW")
         {
            gMainFrame.stage.quality = gMainFrame.currStageQuality != null ? gMainFrame.currStageQuality : "medium";
         }
      }
      
      // between two frames: every animal that is walking goes on by the
      // time since it last moved, the camera follows the player's, sliding
      // windows slide on, and if any of that moved the screen is drawn.
      private static function onSmoothTimer(param1:TimerEvent) : void
      {
         var _loc2_:int = getTimer();
         var _loc3_:int = _loc2_ - _smoothAt;
         var _loc4_:Object = null;
         var _loc5_:AvatarWorldView = null;
         var _loc6_:Boolean = false;
         // too soon after the last step for the rate asked for, or a pause
         // too long to be a step.
         if(_loc3_ < 1 || _loc3_ * 2 < _smoothTimer.delay || _loc3_ > 100)
         {
            return;
         }
         try
         {
            _loc4_ = AvatarManager.avatarViewList;
            for each(_loc5_ in _loc4_)
            {
               if(_loc5_ != null && _loc5_.glide(_loc3_))
               {
                  _loc6_ = true;
               }
            }
            _smoothAt = _loc2_;
            if(RoomManagerWorld.instance.glideCamera(_loc3_))
            {
               _loc6_ = true;
            }
            if(GTween.tickNow())
            {
               _loc6_ = true;
            }
            if(_loc6_)
            {
               _drawn++;
               param1.updateAfterEvent();
            }
         }
         catch(e:Error)
         {
            // #1502, "a script ran too long", is not this code's: the game
            // gets it now and then whatever is running (it is in the notes
            // as a known problem), and one step lost to it is nothing.
            // anything else three times and it is this code that is wrong.
            if(e.errorID != 1502)
            {
               _smoothErrors++;
               if(_smoothErrors >= 3)
               {
                  _smoothBroken = true;
                  _smoothTimer.stop();
                  GlobalErrorCatch.reportToServer("smooth graphics stopped: " + e + "\n" + e.getStackTrace());
               }
            }
         }
      }
      
      public static function wasdOn() : Boolean
      {
         return gMainFrame.userInfo.userVarCache.getUserVarValueById(9002) == 1;
      }

      // "Expanded Inventory" (Strawberry Jam's): the clothes and item
      // pickers show more, smaller items a row. user var 9009, 1 on; the
      // + and - by the avatar editor's item counter pick 3, 4 or 5 a row,
      // user var 9010 (unset is 5, the widest, so turning it on shows).
      public static function expandedInventoryOn() : Boolean
      {
         return settingOf(9009) == 1;
      }

      public static function inventoryColumns() : int
      {
         var _loc1_:int = settingOf(9010);
         if(!expandedInventoryOn())
         {
            return 3;
         }
         return _loc1_ >= 3 && _loc1_ <= 5 ? _loc1_ : 5;
      }

      // the next of 3, 4 and 5 a row, round about; param1 is 1 or -1.
      public static function stepInventoryColumns(param1:int) : void
      {
         var _loc2_:int = (inventoryColumns() - 3 + param1 + 3) % 3 + 3;
         gMainFrame.userInfo.userVarCache.updateUserVar(9010,_loc2_);
         AchievementXtCommManager.requestSetUserVar(9010,_loc2_);
      }
      
      // the arrow key a key stands for: itself, or with the setting on and
      // nothing being typed, the arrow W, A, S or D stands for.
      public static function moveKey(param1:int) : int
      {
         if(param1 < 65 || param1 > 87 || gMainFrame.stage.focus is TextField || !wasdOn())
         {
            return param1;
         }
         switch(param1)
         {
            case 87:
               return 38;
            case 65:
               return 37;
            case 83:
               return 40;
            case 68:
               return 39;
         }
         return param1;
      }
      
      // A short list of words to pick from, drawn here: the game's sort
      // menu was pictures. param1 the words, param2 is told the one picked
      // (its place in the list), param3 the one to mark as the current one.
      public static function makeTextMenu(param1:Array, param2:Function, param3:int = -1) : Sprite
      {
         var _loc4_:Sprite = new Sprite();
         var _loc5_:int = 0;
         var _loc6_:Sprite = null;
         var _loc7_:TextField = null;
         var _loc8_:int = 78;
         var _loc9_:int = 19;
         // one panel in the inventory's colours, a row of it per word.
         _loc4_.graphics.lineStyle(2,8349508);
         _loc4_.graphics.beginFill(16774084);
         _loc4_.graphics.drawRoundRect(0,0,_loc8_ + 8,param1.length * _loc9_ + 8,14,14);
         _loc4_.graphics.endFill();
         while(_loc5_ < param1.length)
         {
            _loc6_ = new Sprite();
            _loc6_.graphics.beginFill(3184463,_loc5_ == param3 ? 1 : 0);
            _loc6_.graphics.drawRoundRect(0,0,_loc8_,_loc9_ - 1,10,10);
            _loc6_.graphics.endFill();
            _loc7_ = new TextField();
            _loc7_.embedFonts = hasGameFont();
            _loc7_.selectable = false;
            _loc7_.autoSize = "left";
            _loc7_.defaultTextFormat = new TextFormat("CCDigitalDelivery",12,_loc5_ == param3 ? 16777215 : 6045213,true);
            _loc7_.text = param1[_loc5_];
            _loc7_.x = 8;
            _loc7_.y = int((_loc9_ - 1 - _loc7_.height) * 0.5);
            _loc6_.addChild(_loc7_);
            _loc6_.x = 4;
            _loc6_.y = 4 + _loc5_ * _loc9_;
            _loc6_.name = "pick" + _loc5_;
            _loc6_.buttonMode = true;
            _loc6_.mouseChildren = false;
            _loc6_.addEventListener("mouseDown",onTextMenuPick,false,0,false);
            _loc4_.addChild(_loc6_);
            _loc5_++;
         }
         _textMenuCallbacks[_loc4_] = param2;
         return _loc4_;
      }
      
      private static var _textMenuCallbacks:Dictionary = new Dictionary(true);
      
      private static function onTextMenuPick(param1:MouseEvent) : void
      {
         var _loc2_:Sprite = param1.currentTarget as Sprite;
         var _loc3_:Function = _textMenuCallbacks[_loc2_.parent];
         param1.stopPropagation();
         if(_loc3_ != null)
         {
            _loc3_(int(_loc2_.name.substr(4)));
         }
      }
      
      // runs one of the chat commands the settings menu's Outfits and Den
      // layouts lists stand for (the server takes only those).
      public static function runCommand(param1:String) : void
      {
         var _loc2_:URLRequest = new URLRequest(gMainFrame.clientInfo.websiteURL + "api/command");
         _loc2_.method = "POST";
         _loc2_.contentType = "application/json";
         _loc2_.data = JSON.stringify({
            "username":gMainFrame.server.userName,
            "token":gMainFrame.clientInfo.authToken,
            "text":param1
         });
         var _loc3_:URLLoader = new URLLoader();
         _loc3_.addEventListener("ioError",onThemeFailed);
         _loc3_.addEventListener("securityError",onThemeFailed);
         _loc3_.load(_loc2_);
      }
      
      private static function onThemeFailed(param1:Event) : void
      {
         GlobalErrorCatch.reportToServer("theme change failed: " + param1);
      }
      
      // ---- the chat filter
      //
      // what other players wrote is filtered here, in each player's own
      // game, as that player chose: the server passes chat on as it was
      // typed. three levels (filterLevel): 0 nothing, which is where an
      // account starts, 1 keeps out extreme threats and common slurs, 2
      // swearing as well; and whatever words the
      // player listed themselves (filterOwn) at any level. two ways
      // (filterMode): 0 puts stars over a filtered word, 1 leaves the
      // whole message out. the words of levels 1 and 2 are two files on
      // the server (public/filter/level1.txt, level2.txt), fetched as the
      // game starts; the choice is kept with the account ("xfl").
      //
      // A word is matched whole, never inside another. digits and signs
      // standing in for letters are read as the letters, and a word with a
      // letter drawn out ("heeello") is matched as if it were not.
      public static var filterLevel:int = 0;
      
      public static var filterMode:int = 0;
      
      public static var filterOwn:String = "";
      
      public static var filterChosen:Boolean = true;
      
      public static var FILTER_HIDDEN:String = "(hidden by your chat filter)";
      
      private static var _filterLists:Array = [[],[]];
      
      private static var _filterOwnEntries:Array = [];
      
      private static var _filterLoaders:Array = [];
      
      private static function filterPlain(param1:String) : String
      {
         var _loc2_:String = param1.toLowerCase().replace(/^[0-9]+|[0-9]+$/g,"");
         _loc2_ = _loc2_.replace(/[@4]/g,"a").replace(/[$5]/g,"s").replace(/0/g,"o").replace(/1/g,"i").replace(/3/g,"e").replace(/7/g,"t");
         return _loc2_.replace(/[^a-z]/g,"");
      }
      
      private static function filterSquash(param1:String) : String
      {
         return param1.replace(/(.)\1+/g,"$1");
      }
      
      // the entries of a word list: a line is a word or a phrase, "#" starts
      // a note, and a "*" at the end stands for "and longer words that
      // start so". each entry: {t the words made plain, n how many words,
      // p whether it had the star, q the same with drawn-out letters undone}.
      private static function filterEntries(param1:String) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:Array = param1.split(/\r\n|\r|\n|,/);
         var _loc4_:int = 0;
         var _loc5_:String = null;
         var _loc6_:Boolean = false;
         var _loc7_:Array = null;
         var _loc8_:Array = null;
         var _loc9_:int = 0;
         var _loc10_:String = null;
         while(_loc4_ < _loc3_.length)
         {
            _loc5_ = String(_loc3_[_loc4_]).replace(/^\s+|\s+$/g,"");
            _loc4_++;
            if(_loc5_.length == 0 || _loc5_.charAt(0) == "#")
            {
               continue;
            }
            _loc6_ = _loc5_.charAt(_loc5_.length - 1) == "*";
            _loc7_ = _loc5_.split(/\s+/);
            _loc8_ = [];
            _loc9_ = 0;
            while(_loc9_ < _loc7_.length)
            {
               _loc10_ = filterPlain(String(_loc7_[_loc9_]));
               if(_loc10_.length > 0)
               {
                  _loc8_.push(_loc10_);
               }
               _loc9_++;
            }
            if(_loc8_.length > 0 && _loc8_.join("").length >= 2)
            {
               _loc2_.push({
                  "t":_loc8_.join(" "),
                  "n":_loc8_.length,
                  "p":_loc6_,
                  "q":filterSquash(_loc8_.join(" "))
               });
            }
         }
         return _loc2_;
      }
      
      private static function loadFilterLists() : void
      {
         var _loc1_:int = 0;
         var _loc2_:URLLoader = null;
         while(_loc1_ < 2)
         {
            _loc2_ = new URLLoader();
            _loc2_.addEventListener("complete",onFilterListLoaded);
            _loc2_.addEventListener("ioError",onFilterListFailed);
            _loc2_.addEventListener("securityError",onFilterListFailed);
            _filterLoaders[_loc1_] = _loc2_;
            _loc2_.load(new URLRequest(gMainFrame.clientInfo.websiteURL + "filter/level" + (_loc1_ + 1) + ".txt"));
            _loc1_++;
         }
      }
      
      private static function onFilterListLoaded(param1:Event) : void
      {
         var _loc2_:int = _filterLoaders.indexOf(param1.target);
         if(_loc2_ >= 0)
         {
            _filterLists[_loc2_] = filterEntries(String(URLLoader(param1.target).data));
         }
      }
      
      private static function onFilterListFailed(param1:Event) : void
      {
         GlobalErrorCatch.reportToServer("chat filter: a word list did not load: " + param1);
      }
      
      // "xfl": [.., .., chosen, level, mode, own words]. the account's
      // choice, at login and after each change.
      public static function onFilterState(param1:Object) : void
      {
         filterChosen = String(param1[2]) == "1";
         filterLevel = int(param1[3]);
         filterMode = int(param1[4]);
         filterOwn = param1[5] == null ? "" : String(param1[5]);
         _filterOwnEntries = filterEntries(filterOwn);
      }
      
      // "xfa": the account has never chosen; the rules are put to it first,
      // then the window.
      public static function onFilterAsk(param1:Object) : void
      {
         openRules(function():void
         {
            openTool(1);
         });
      }
      
      // is the word at `param2` of the plain words `param1` (and those after
      // it, for a phrase) the entry `param3`?
      private static function filterHit(param1:Array, param2:int, param3:Object) : Boolean
      {
         var _loc4_:String = null;
         var _loc5_:String = null;
         if(param3.n > 1)
         {
            return param2 + param3.n <= param1.length && param1.slice(param2,param2 + param3.n).join(" ") == param3.t;
         }
         _loc4_ = param1[param2];
         if(_loc4_ == param3.t || param3.p && _loc4_.indexOf(param3.t) == 0)
         {
            return true;
         }
         if(/(.)\1\1/.test(_loc4_))
         {
            _loc5_ = filterSquash(_loc4_);
            return _loc5_ == param3.q || param3.p && _loc5_.indexOf(param3.q) == 0;
         }
         return false;
      }
      
      // what the player is to see of something another player wrote: the
      // text as it was, the text with stars over the filtered words, or
      // null when it is to be left out altogether.
      public static function filterText(param1:String, param2:Boolean = false) : String
      {
         var _loc2_:Array = _filterOwnEntries;
         var _loc3_:Array = [];
         var _loc4_:Array = [];
         var _loc5_:Array = [];
         var _loc6_:RegExp = /[A-Za-z0-9@$]+/g;
         var _loc7_:Object = null;
         var _loc8_:String = null;
         var _loc9_:int = 0;
         var _loc10_:int = 0;
         var _loc11_:int = 0;
         var _loc12_:Array = null;
         var _loc13_:Boolean = false;
         if(param1 == null || param1.length == 0)
         {
            return param1;
         }
         if(filterLevel >= 1)
         {
            _loc2_ = _loc2_.concat(_filterLists[0]);
         }
         if(filterLevel >= 2)
         {
            _loc2_ = _loc2_.concat(_filterLists[1]);
         }
         if(_loc2_.length == 0)
         {
            return param1;
         }
         _loc7_ = _loc6_.exec(param1);
         while(_loc7_ != null)
         {
            _loc8_ = filterPlain(String(_loc7_[0]));
            if(_loc8_.length > 0)
            {
               _loc3_.push(_loc8_);
               _loc4_.push(int(_loc7_.index));
               _loc5_.push(int(_loc7_.index) + String(_loc7_[0]).length);
            }
            _loc7_ = _loc6_.exec(param1);
         }
         _loc12_ = param1.split("");
         _loc9_ = 0;
         while(_loc9_ < _loc3_.length)
         {
            _loc10_ = 0;
            while(_loc10_ < _loc2_.length)
            {
               if(filterHit(_loc3_,_loc9_,_loc2_[_loc10_]))
               {
                  _loc13_ = true;
                  _loc11_ = _loc4_[_loc9_];
                  while(_loc11_ < _loc5_[_loc9_ + _loc2_[_loc10_].n - 1])
                  {
                     if(_loc12_[_loc11_] != " ")
                     {
                        _loc12_[_loc11_] = "*";
                     }
                     _loc11_++;
                  }
               }
               _loc10_++;
            }
            _loc9_++;
         }
         if(!_loc13_)
         {
            return param1;
         }
         return filterMode == 1 && !param2 ? null : _loc12_.join("");
      }

      // an animal's or a pet's typed name: a name cannot be left out, so its
      // filtered words are starred whichever the player chose.
      public static function filterName(param1:String) : String
      {
         return filterText(param1,true);
      }
      
      // the same for text that has a place of its own (a Jam-A-Gram, a wall
      // post, a bio): left out, it is replaced by a note saying so.
      public static function filterOrNote(param1:String) : String
      {
         var _loc2_:String = filterText(param1);
         return _loc2_ == null ? FILTER_HIDDEN : _loc2_;
      }
      
      // the window: the settings menu's "Chat Filter" row, and by itself
      // the first time an account plays. built like the item finder, from
      // the same pieces of the game's artwork. two lists to pick one row
      // of each from, the row in use tinted green: what is filtered, and
      // what becomes of a filtered word. under them the player's own words
      // and one wide Save button: nothing changes until it is pressed, and
      // it lights up when there is something to save.
      private static var FILTER_LEVELS:Array = [0,1,2];
      
      private static var FILTER_ROW_NAMES:Array = ["No filter","Slurs and threats","Slurs, threats and swearing","Censor the words (****)","Hide the whole message"];
      
      private static var FILTER_ROW_Y:Array = [-104,-64,-24,44,84];
      
      private var _filterWin:Sprite;
      
      private var _filterRowClips:Array;
      
      private var _filterSave:Sprite;
      
      private var _filterWordsBar:MovieClip;
      
      private var _filterWordsInput:TextField;
      
      private var _filterPickLevel:int;
      
      private var _filterPickMode:int;
      
      private function buildChatFilter() : void
      {
         var _loc1_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupSkin");
         var _loc2_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupContent");
         var _loc3_:int = 1;
         var _loc4_:Sprite = new Sprite();
         var _loc6_:MovieClip = null;
         var _loc8_:TextField = null;
         var _loc9_:Matrix = new Matrix();
         _filterWin = new Sprite();
         _filterWin.graphics.beginFill(0,0.45);
         _filterWin.graphics.drawRect(0,0,900,550);
         _filterWin.graphics.endFill();
         _loc4_.x = 450;
         _loc4_.y = 275;
         _filterWin.addChild(_loc4_);
         _loc4_.addChild(_loc1_);
         _loc2_.x = _loc1_.c.x;
         _loc2_.y = _loc1_.c.y;
         _loc4_.addChild(_loc2_);
         _loc1_.bx.addEventListener("mouseDown",onFilterCloseClick);
         while(_loc3_ <= 5)
         {
            _loc2_["ruleTxt" + _loc3_].visible = false;
            _loc2_["ruleBodyTxt" + _loc3_].visible = false;
            _loc3_++;
         }
         _loc2_.titleTxt.text = "Chat Filter";
         _loc8_ = _loc2_.ruleBodyTxt1;
         _loc8_.visible = true;
         _loc8_.wordWrap = false;
         _loc8_.x = -171;
         _loc8_.y = -152;
         _loc8_.width = 346;
         _loc8_.height = 24;
         _loc8_.text = "Choose what you don't want to see.";
         _loc8_ = _loc2_.ruleBodyTxt2;
         _loc8_.visible = true;
         _loc8_.wordWrap = false;
         _loc8_.x = -171;
         _loc8_.y = 0;
         _loc8_.width = 346;
         _loc8_.height = 24;
         _loc8_.text = "When a word is filtered:";
         _filterRowClips = [];
         _loc3_ = 0;
         while(_loc3_ < 5)
         {
            _loc6_ = GETDEFINITIONBYNAME("textBtnCont");
            _loc6_.x = 2;
            _loc6_.y = FILTER_ROW_Y[_loc3_];
            _loc6_.name = "pick" + _loc3_;
            _loc6_.currTxt.mouseEnabled = false;
            _loc6_.currTxt.text = FILTER_ROW_NAMES[_loc3_];
            _loc6_.addEventListener("mouseDown",onFilterPick);
            _loc2_.addChild(_loc6_);
            _filterRowClips.push(_loc6_);
            _loc3_++;
         }
         _filterWordsBar = finderSearchBar(-171,108,346,"Your own words, spaces between","^%",300,false);
         _filterWordsInput = _filterWordsBar.searchTxt;
         _filterWordsInput.addEventListener("change",onFilterTyped);
         _loc2_.addChild(_filterWordsBar);
         // the Save button: as wide as the rows, in the game's green.
         _filterSave = new Sprite();
         _filterSave.graphics.beginFill(1924906);
         _filterSave.graphics.drawRoundRect(0,0,346,38,38,38);
         _filterSave.graphics.endFill();
         _loc9_.createGradientBox(340,32,Math.PI / 2,3,3);
         _filterSave.graphics.beginGradientFill("linear",[8314449,4105022],[1,1],[0,255],_loc9_);
         _filterSave.graphics.drawRoundRect(3,3,340,32,32,32);
         _filterSave.graphics.endFill();
         _loc8_ = new TextField();
         _loc8_.embedFonts = hasGameFont();
         _loc8_.selectable = false;
         _loc8_.mouseEnabled = false;
         _loc8_.autoSize = "left";
         _loc8_.defaultTextFormat = new TextFormat("CCDigitalDelivery",18,16777215,true);
         _loc8_.text = "Save";
         _loc8_.x = int((346 - _loc8_.width) * 0.5);
         _loc8_.y = int((38 - _loc8_.height) * 0.5);
         _filterSave.addChild(_loc8_);
         _filterSave.x = -171;
         _filterSave.y = 157;
         _filterSave.buttonMode = true;
         _filterSave.mouseChildren = false;
         _filterSave.addEventListener("mouseDown",onFilterSaveClick);
         _loc2_.addChild(_filterSave);
         _filterWin.addEventListener("mouseDown",onFinderMouse);
         _filterWin.addEventListener("mouseUp",onFinderMouse);
         _filterWin.addEventListener("click",onFinderMouse);
         _filterWin.addEventListener("mouseWheel",onFinderMouse);
         _filterWin.visible = false;
         addChild(_filterWin);
      }
      
      private function filterWordsTyped() : String
      {
         var _loc1_:Array = _filterWordsInput.text.split(/[\s,]+/);
         var _loc2_:Array = [];
         var _loc3_:int = 0;
         while(_loc3_ < _loc1_.length && _loc2_.length < 100)
         {
            if(String(_loc1_[_loc3_]).length > 0)
            {
               _loc2_.push(String(_loc1_[_loc3_]).substr(0,30));
            }
            _loc3_++;
         }
         return _loc2_.join(",");
      }
      
      // the rows as the picks stand, and the Save button: bright when what
      // shows differs from what is kept (or nothing was ever chosen), pale
      // when there is nothing to save.
      private function drawChatFilter() : void
      {
         var _loc1_:int = 0;
         var _loc2_:Boolean = false;
         while(_loc1_ < 5)
         {
            _loc2_ = _loc1_ < 3 ? FILTER_LEVELS[_loc1_] == _filterPickLevel : _loc1_ - 3 == _filterPickMode;
            _filterRowClips[_loc1_].transform.colorTransform = _loc2_ ? whisperTint() : new ColorTransform();
            _loc1_++;
         }
         _filterWordsBar.txt.visible = _filterWordsInput.text.length == 0;
         _loc2_ = !filterChosen || _filterPickLevel != filterLevel || _filterPickMode != (filterMode == 1 ? 1 : 0) || filterWordsTyped() != filterOwn;
         _filterSave.alpha = _loc2_ ? 1 : 0.45;
      }
      
      private function onFilterTyped(param1:Event) : void
      {
         drawChatFilter();
      }
      
      // the rules come from the server's data/rules.txt (GET /rules.txt), read
      // each time the window opens, so they change without a new client: a
      // line starting "# " is a heading, the rest is shown as it is written.
      private static const RULES_HEADING:String = "<font size=\"16\" color=\"#563421\"><b>";

      private static const RULES_BODY:String = "<font size=\"13\" color=\"#6E4A2E\"><b>";

      private static function rulesHtml(param1:String) : String
      {
         var _loc2_:Array = param1.replace(/\r/g,"").split("\n");
         var _loc3_:Array = [];
         var _loc4_:String = null;
         var _loc5_:int = 0;
         while(_loc5_ < _loc2_.length)
         {
            _loc4_ = String(_loc2_[_loc5_]).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            if(_loc4_.indexOf("# ") == 0)
            {
               _loc3_.push(RULES_HEADING + _loc4_.substr(2) + "</b></font>");
            }
            else
            {
               _loc3_.push(RULES_BODY + _loc4_ + "</b></font>");
            }
            _loc5_++;
         }
         return _loc3_.join("<br>");
      }

      private function loadRules() : void
      {
         var _loc1_:URLLoader = new URLLoader();
         _rulesText.htmlText = rulesHtml("Loading...");
         _loc1_.addEventListener("complete",onRulesLoaded);
         _loc1_.addEventListener("ioError",onRulesFailed);
         _loc1_.addEventListener("securityError",onRulesFailed);
         _loc1_.load(new URLRequest(gMainFrame.clientInfo.websiteURL + "rules.txt?t=" + new Date().getTime()));
      }

      private function onRulesLoaded(param1:Event) : void
      {
         _rulesText.htmlText = rulesHtml(String(URLLoader(param1.currentTarget).data));
         _rulesText.scrollV = 1;
      }

      private function onRulesFailed(param1:Event) : void
      {
         _rulesText.htmlText = rulesHtml("The rules could not be loaded. Try again in a moment.");
      }
      
      private var _rulesWin:Sprite;
      
      private var _rulesText:TextField;
      
      // what to do once the rules are closed (the chat filter, the first time)
      private static var _rulesThen:Function;
      
      // the rules, in the game's rules popup (its frame and text style), with
      // room for all of them: the text scrolls with the wheel or the arrows.
      // the game's own rules popup (GuiManager.displayRulesPopup) opens this.
      private function buildRules() : void
      {
         var _loc1_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupSkin");
         var _loc2_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupContent");
         var _loc3_:int = 1;
         var _loc4_:Sprite = new Sprite();
         var _loc5_:MovieClip = null;
         _rulesWin = new Sprite();
         _rulesWin.graphics.beginFill(0,0.45);
         _rulesWin.graphics.drawRect(0,0,900,550);
         _rulesWin.graphics.endFill();
         _loc4_.x = 450;
         _loc4_.y = 275;
         _rulesWin.addChild(_loc4_);
         _loc4_.addChild(_loc1_);
         _loc2_.x = _loc1_.c.x;
         _loc2_.y = _loc1_.c.y;
         _loc4_.addChild(_loc2_);
         _loc1_.bx.addEventListener("mouseDown",onRulesCloseClick);
         while(_loc3_ <= 5)
         {
            _loc2_["ruleTxt" + _loc3_].visible = false;
            _loc2_["ruleBodyTxt" + _loc3_].visible = false;
            _loc3_++;
         }
         _loc2_.titleTxt.text = "Burrow Rules";
         _rulesText = _loc2_.ruleBodyTxt1;
         _rulesText.visible = true;
         _rulesText.multiline = true;
         _rulesText.wordWrap = true;
         _rulesText.mouseWheelEnabled = true;
         _rulesText.selectable = false;
         _rulesText.x = -245;
         _rulesText.y = -158;
         _rulesText.width = 462;
         _rulesText.height = 338;
         _loc5_ = GETDEFINITIONBYNAME("arrow_r_btnContOld");
         _loc5_.rotation = -90;
         _loc5_.x = 236;
         _loc5_.y = -136;
         _loc5_.name = "up";
         _loc5_.addEventListener("mouseDown",onRulesArrow);
         _loc2_.addChild(_loc5_);
         _loc5_ = GETDEFINITIONBYNAME("arrow_r_btnContOld");
         _loc5_.rotation = 90;
         _loc5_.x = 236;
         _loc5_.y = 160;
         _loc5_.name = "down";
         _loc5_.addEventListener("mouseDown",onRulesArrow);
         _loc2_.addChild(_loc5_);
         _rulesWin.addEventListener("mouseDown",onFinderMouse);
         _rulesWin.addEventListener("mouseUp",onFinderMouse);
         _rulesWin.addEventListener("click",onFinderMouse);
         _rulesWin.addEventListener("mouseWheel",onFinderMouse);
         _rulesWin.visible = false;
         addChild(_rulesWin);
      }
      
      private function showRules(param1:Boolean) : void
      {
         if(_rulesWin == null)
         {
            buildRules();
         }
         _rulesWin.visible = param1;
         if(param1)
         {
            loadRules();
            _rulesText.scrollV = 1;
            setChildIndex(_rulesWin,numChildren - 1);
         }
      }
      
      private function onRulesArrow(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         _rulesText.scrollV += param1.currentTarget.name == "up" ? -4 : 4;
      }
      
      private function onRulesCloseClick(param1:MouseEvent) : void
      {
         var _loc2_:Function = _rulesThen;
         param1.stopPropagation();
         showRules(false);
         _rulesThen = null;
         if(_loc2_ != null)
         {
            _loc2_();
         }
      }
      
      // the rules window, then `param1` once it is closed
      public static function openRules(param1:Function = null) : void
      {
         if(_toolsInstance == null)
         {
            return;
         }
         try
         {
            _rulesThen = param1;
            _toolsInstance.showRules(true);
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("rules: " + e + "\n" + e.getStackTrace());
         }
      }
      
      public static function closeRules() : void
      {
         if(_toolsInstance != null && _toolsInstance._rulesWin != null)
         {
            _rulesThen = null;
            _toolsInstance.showRules(false);
         }
      }
      
      private function showChatFilter(param1:Boolean) : void
      {
         if(_filterWin == null)
         {
            buildChatFilter();
         }
         _filterWin.visible = param1;
         if(param1)
         {
            _filterPickLevel = filterLevel;
            _filterPickMode = filterMode == 1 ? 1 : 0;
            _filterWordsInput.text = filterOwn.split(",").join(" ");
            drawChatFilter();
            setChildIndex(_filterWin,numChildren - 1);
         }
         else
         {
            gMainFrame.stage.focus = null;
         }
      }
      
      private function onFilterPick(param1:MouseEvent) : void
      {
         var _loc2_:int = int(DisplayObject(param1.currentTarget).name.substr(4));
         param1.stopPropagation();
         if(_loc2_ < 3)
         {
            _filterPickLevel = FILTER_LEVELS[_loc2_];
         }
         else
         {
            _filterPickMode = _loc2_ - 3;
         }
         drawChatFilter();
      }
      
      // the picks go to the server, which keeps them with the account and
      // answers with them ("xfl"), and that answer is what takes effect.
      private function saveChatFilter() : void
      {
         gMainFrame.server.setXtObject_Str("xfl",[_filterPickLevel,_filterPickMode,filterWordsTyped()]);
         showChatFilter(false);
      }
      
      private function onFilterSaveClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         saveChatFilter();
      }
      
      // closed without saving: nothing changes. the first time, that still
      // counts as having been asked, and what was showing is kept.
      private function onFilterCloseClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(!filterChosen)
         {
            saveChatFilter();
            return;
         }
         showChatFilter(false);
      }
      
      private function finderButtonText(param1:MovieClip, param2:String) : void
      {
         var _loc3_:Array = [param1.getChildByName("gray"),param1.getChildByName("down")];
         var _loc4_:MovieClip = param1.getChildByName("mouse") as MovieClip;
         var _loc5_:MovieClip = null;
         var _loc6_:TextField = null;
         var _loc7_:int = 0;
         if(_loc4_ != null)
         {
            _loc3_.push(_loc4_.getChildByName("up"));
            _loc3_.push(_loc4_.getChildByName("mouse"));
            _loc7_ = 0;
            while(_loc7_ < _loc4_.numChildren)
            {
               _loc3_.push(_loc4_.getChildAt(_loc7_));
               _loc7_++;
            }
         }
         _loc7_ = 0;
         while(_loc7_ < _loc3_.length)
         {
            _loc5_ = _loc3_[_loc7_] as MovieClip;
            if(_loc5_ != null)
            {
               _loc6_ = _loc5_.getChildByName("txt") as TextField;
               if(_loc6_ != null)
               {
                  _loc6_.text = param2;
               }
            }
            _loc7_++;
         }
      }
      
      private function finderSearchBar(param1:Number, param2:Number, param3:Number, param4:String, param5:String, param6:int, param7:Boolean) : MovieClip
      {
         var _loc8_:MovieClip = GETDEFINITIONBYNAME("searchBar_den");
         var _loc9_:TextField = _loc8_.searchTxt;
         var _loc10_:Shape = new Shape();
         var _loc11_:Matrix = new Matrix();
         var _loc12_:int = 0;
         var _loc13_:Number = param7 ? 35 : 16;
         _loc8_.t.visible = false;
         _loc8_.m.visible = false;
         _loc8_.b.visible = false;
         if(!param7)
         {
            while(_loc12_ < _loc8_.numChildren)
            {
               if(_loc8_.getChildAt(_loc12_) is Shape)
               {
                  _loc8_.getChildAt(_loc12_).visible = false;
               }
               _loc12_++;
            }
         }
         _loc10_.graphics.beginFill(7160624);
         _loc10_.graphics.drawRoundRect(0,4,param3,34,34,34);
         _loc10_.graphics.endFill();
         _loc10_.graphics.beginFill(10115109);
         _loc10_.graphics.drawRoundRect(1,5,param3 - 2,32,32,32);
         _loc10_.graphics.endFill();
         _loc11_.createGradientBox(param3 - 8,26,Math.PI / 2,4,8);
         _loc10_.graphics.beginGradientFill("linear",[11459790,15261660,16250099],[1,1,1],[0,127,255],_loc11_);
         _loc10_.graphics.drawRoundRect(4,8,param3 - 8,26,26,26);
         _loc10_.graphics.endFill();
         _loc8_.addChildAt(_loc10_,0);
         _loc8_.txt.text = param4;
         _loc8_.txt.x = _loc13_;
         _loc8_.txt.width = param3 - _loc13_ - 12;
         _loc8_.txt.mouseEnabled = false;
         _loc9_.type = "input";
         _loc9_.selectable = true;
         _loc9_.mouseEnabled = true;
         _loc9_.visible = true;
         _loc9_.x = _loc13_;
         _loc9_.width = param3 - _loc13_ - 12;
         _loc9_.maxChars = param6;
         _loc9_.text = "";
         if(param5 != null)
         {
            _loc9_.restrict = param5;
         }
         _loc9_.addEventListener("change",onFinderTyped);
         _loc8_.x = param1;
         _loc8_.y = param2;
         return _loc8_;
      }
      
      // A bar's hint shows while nothing is typed in it.
      private function onFinderTyped(param1:Event) : void
      {
         var _loc2_:TextField = param1.target as TextField;
         var _loc3_:MovieClip = _loc2_ == null ? null : _loc2_.parent as MovieClip;
         if(_loc3_ != null && _loc3_.txt != null)
         {
            _loc3_.txt.visible = _loc2_.text.length == 0;
         }
      }
      
      private function buildItemFinder() : void
      {
         var _loc1_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupSkin");
         var _loc2_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupContent");
         var _loc3_:int = 1;
         var _loc4_:MovieClip = null;
         var _loc5_:MovieClip = null;
         _finder = new Sprite();
         _finder.graphics.beginFill(0,0.45);
         _finder.graphics.drawRect(0,0,900,550);
         _finder.graphics.endFill();
         _finderPanel = new Sprite();
         _finderPanel.x = 450;
         _finderPanel.y = 275;
         _finder.addChild(_finderPanel);
         _finderPanel.addChild(_loc1_);
         _loc2_.x = _loc1_.c.x;
         _loc2_.y = _loc1_.c.y;
         _finderPanel.addChild(_loc2_);
         _loc1_.bx.addEventListener("mouseDown",onFinderCloseClick);
         while(_loc3_ <= 5)
         {
            _loc2_["ruleTxt" + _loc3_].visible = false;
            _loc2_["ruleBodyTxt" + _loc3_].visible = false;
            _loc3_++;
         }
         _loc2_.titleTxt.text = "Item Giver";
         _finderStatus = _loc2_.ruleBodyTxt1;
         _finderStatus.visible = true;
         _finderStatus.wordWrap = false;
         _finderStatus.x = -245;
         _finderStatus.y = -112;
         _finderStatus.width = 490;
         _finderStatus.height = 24;
         _finderStatus.text = "Type a name or an id, then press Enter.";
         _finderPageLabel = _loc2_.ruleBodyTxt2;
         _finderPageLabel.visible = true;
         _finderPageLabel.wordWrap = false;
         _finderPageLabel.x = -60;
         _finderPageLabel.y = 154;
         _finderPageLabel.width = 200;
         _finderPageLabel.height = 24;
         _finderPageLabel.text = "";
         _loc2_.addChild(finderLink(_loc2_.ruleBodyTxt3,"Colour picker",FINDER_COLOUR_PICKER,60,154,150));
         _finderInputBar = finderSearchBar(-247,-160,212,"Name or id",null,60,true);
         _finderInput = _finderInputBar.searchTxt;
         _loc2_.addChild(_finderInputBar);
         _finderKindButton = GETDEFINITIONBYNAME("introBtnCont");
         _finderKindButton.x = -30;
         _finderKindButton.y = -156;
         finderButtonText(_finderKindButton,"All items");
         _finderKindButton.addEventListener("mouseDown",onFinderKindClick);
         _loc2_.addChild(_finderKindButton);
         // a colour id may be negative: the signed way of writing it (lib/admin.js)
         _finderColourBar = finderSearchBar(93,-160,156,"Colour ID or #hex","0-9a-fA-F# ,\\-",31,false);
         _finderColourInput = _finderColourBar.searchTxt;
         _finderColourInput.addEventListener("change",onFinderColourTyped);
         _loc2_.addChild(_finderColourBar);
         _finderRows = new Sprite();
         _finderRows.x = 0;
         _finderRows.y = -62;
         _loc2_.addChild(_finderRows);
         _loc4_ = GETDEFINITIONBYNAME("arrow_l_btnContOld");
         _loc4_.x = -228;
         _loc4_.y = 166;
         _loc4_.addEventListener("mouseDown",onFinderPrevClick);
         _loc2_.addChild(_loc4_);
         _loc5_ = GETDEFINITIONBYNAME("arrow_r_btnContOld");
         _loc5_.x = 228;
         _loc5_.y = 166;
         _loc5_.addEventListener("mouseDown",onFinderNextClick);
         _loc2_.addChild(_loc5_);
         _finder.addEventListener("mouseDown",onFinderMouse);
         _finder.addEventListener("mouseUp",onFinderMouse);
         _finder.addEventListener("click",onFinderMouse);
         _finder.addEventListener("mouseWheel",onFinderMouse);
         _finder.visible = false;
         addChild(_finder);
      }
      
      // made by players for working out custom colours
      private static const FINDER_COLOUR_PICKER:String = "https://aj-color-picker.carrd.co/";
      
      // `param1` (a text field of the artwork's, for its font) as a link at
      // param4, param5, right-aligned in param6. the game's webview may open
      // no window, so the page asks the client to open it in the system
      // browser (ajOpenPage in public/game.html); clients before 1.1.2 drop
      // that, so the address is copied as well.
      private function finderLink(param1:TextField, param2:String, param3:String, param4:Number, param5:Number, param6:Number) : Sprite
      {
         var _loc7_:Sprite = new Sprite();
         var _loc8_:TextFormat = param1.getTextFormat();
         _loc8_.align = "right";
         _loc8_.underline = true;
         param1.parent.removeChild(param1);
         param1.visible = true;
         param1.wordWrap = false;
         param1.selectable = false;
         param1.x = 0;
         param1.y = 0;
         param1.width = param6;
         param1.height = 24;
         param1.defaultTextFormat = _loc8_;
         param1.text = param2;
         param1.setTextFormat(_loc8_);
         _loc7_.addChild(param1);
         _loc7_.x = param4;
         _loc7_.y = param5;
         _loc7_.buttonMode = true;
         _loc7_.useHandCursor = true;
         _loc7_.mouseChildren = false;
         _loc7_.addEventListener("mouseDown",function(param1:MouseEvent):void
         {
            param1.stopPropagation();
            try
            {
               System.setClipboard(param3);
            }
            catch(e:Error)
            {
            }
            try
            {
               if(ExternalInterface.available)
               {
                  ExternalInterface.call("ajOpenPage",param3);
               }
            }
            catch(e:Error)
            {
            }
            _finderStatus.text = "Link copied.";
         });
         return _loc7_;
      }
      
      private function showItemFinder(param1:Boolean) : void
      {
         if(_finder == null)
         {
            buildItemFinder();
         }
         _finder.visible = param1;
         if(param1)
         {
            setChildIndex(_finder,numChildren - 1);
            gMainFrame.stage.focus = _finderInput;
         }
         else
         {
            gMainFrame.stage.focus = null;
         }
      }
      
      private function onFinderMouse(param1:Event) : void
      {
         param1.stopPropagation();
      }
      
      private function onFinderCloseClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         showItemFinder(false);
      }

      // ---- the staff's window for one player, from the report button of
      // their card. each button is a staff command for that player ("xmd",
      // which the server runs as if typed: lib/commands.js, its permission
      // checks and log included); only the ones the role allows are shown.
      // the window closes and the server's answer comes as a message box.
      // a warning's reason, as the server knows it, and its chip. with text
      // in the box, Warn sends that text as the warning ("custom": what the
      // player is shown) and the reason is not used.
      private static const MODERATE_REASONS:Array = ["behavior","bullying","personal","scamming"];

      private static const MODERATE_REASON_NAMES:Array = ["Behavior","Bullying","Personal info","Scamming"];

      // the window's look: flat, dark, rounded, in the game's font.
      private static const MOD_W:int = 560;

      private static const MOD_H:int = 486;

      private static const MOD_PAD:int = 24;

      private static const MOD_BG:uint = 0x1C1D24;

      private static const MOD_EDGE:uint = 0x34364A;

      private static const MOD_FIELD:uint = 0x272934;

      private static const MOD_MUTED:uint = 0x9A9DB0;

      private static const MOD_GREY:uint = 0x3A3D4E;

      private static const MOD_AMBER:uint = 0xE0A030;

      private static const MOD_BLUE:uint = 0x3D7BF0;

      private static const MOD_PURPLE:uint = 0x8B5CF6;

      private static const MOD_TEAL:uint = 0x14A38B;

      private static const MOD_RED:uint = 0xE0475B;

      // text in the game's font (embedded when the game has it).
      public static function modText(param1:String, param2:int, param3:uint, param4:Boolean = true) : TextField
      {
         var _loc5_:TextField = new TextField();
         _loc5_.embedFonts = hasGameFont();
         _loc5_.selectable = false;
         _loc5_.mouseEnabled = false;
         _loc5_.autoSize = "left";
         _loc5_.defaultTextFormat = new TextFormat("CCDigitalDelivery",param2,param3,param4);
         _loc5_.text = param1;
         return _loc5_;
      }

      // a flat button: a rounded box of colour `param6`, its label centred.
      private function modButton(param1:String, param2:String, param3:Number, param4:Number, param5:Number, param6:uint, param7:String) : Sprite
      {
         var _loc8_:Sprite = new Sprite();
         _loc8_.name = param1;
         _loc8_.x = param3;
         _loc8_.y = param4;
         _loc8_.buttonMode = true;
         _loc8_.useHandCursor = true;
         _loc8_.mouseChildren = false;
         var _loc9_:TextField = modText(param2,14,0xFFFFFF);
         _loc9_.name = "label";
         _loc8_.addChild(_loc9_);
         paintFlatButton(_loc8_,param5,param6);
         _loc8_.addEventListener("mouseDown",onModerateButton);
         _loc8_.addEventListener("mouseOver",onFlatHover);
         _loc8_.addEventListener("mouseOut",onFlatHover);
         _moderateContent.addChild(_loc8_);
         _moderateButtons.push({
            "clip":_loc8_,
            "permission":param7
         });
         return _loc8_;
      }

      // draws a flat button `param2` wide in colour `param3`, its label
      // ("label") centred in it. also for the settings menu's own windows.
      public static function paintFlatButton(param1:Sprite, param2:Number, param3:uint) : void
      {
         var _loc4_:TextField = param1.getChildByName("label") as TextField;
         param1.graphics.clear();
         param1.graphics.beginFill(param3);
         param1.graphics.drawRoundRect(0,0,param2,34,14,14);
         param1.graphics.endFill();
         if(_loc4_ != null)
         {
            _loc4_.x = int((param2 - _loc4_.width) * 0.5);
            _loc4_.y = int((34 - _loc4_.height) * 0.5);
         }
      }

      private static function modSetLabel(param1:Sprite, param2:String) : void
      {
         var _loc3_:TextField = param1.getChildByName("label") as TextField;
         var _loc4_:Number = param1.width;
         _loc3_.text = param2;
         _loc3_.x = int((_loc4_ - _loc3_.width) * 0.5);
      }

      public static function onFlatHover(param1:MouseEvent) : void
      {
         Sprite(param1.currentTarget).alpha = param1.type == "mouseOver" ? 0.82 : 1;
      }

      private function modSection(param1:String, param2:Number) : void
      {
         var _loc3_:TextField = modText(param1.toUpperCase(),11,MOD_MUTED);
         _loc3_.x = MOD_PAD;
         _loc3_.y = param2;
         _moderateContent.addChild(_loc3_);
      }

      private function buildModerate() : void
      {
         var _loc1_:Number = (MOD_W - MOD_PAD * 2 - 20) / 3; // a column's width
         var _loc2_:Array = [MOD_PAD,MOD_PAD + _loc1_ + 10,MOD_PAD + (_loc1_ + 10) * 2];
         var _loc3_:Sprite = null;
         var _loc4_:Number = MOD_PAD;
         var _loc5_:int = 0;
         _moderate = new Sprite();
         _moderate.graphics.beginFill(0,0.55);
         _moderate.graphics.drawRect(0,0,900,550);
         _moderate.graphics.endFill();
         _moderateContent = new Sprite();
         _moderateContent.x = int((900 - MOD_W) * 0.5);
         _moderateContent.y = int((550 - MOD_H) * 0.5);
         // a soft shadow, then the panel
         _moderateContent.graphics.beginFill(0,0.35);
         _moderateContent.graphics.drawRoundRect(0,6,MOD_W,MOD_H,26,26);
         _moderateContent.graphics.endFill();
         _moderateContent.graphics.lineStyle(1,MOD_EDGE);
         _moderateContent.graphics.beginFill(MOD_BG);
         _moderateContent.graphics.drawRoundRect(0,0,MOD_W,MOD_H,26,26);
         _moderateContent.graphics.endFill();
         _moderate.addChild(_moderateContent);
         _moderateButtons = [];
         _moderateTitle = modText("",22,0xFFFFFF);
         _moderateTitle.x = MOD_PAD;
         _moderateTitle.y = 18;
         _moderateContent.addChild(_moderateTitle);
         var _loc6_:TextField = modText("Everything here is logged under your name.",12,MOD_MUTED,false);
         _loc6_.x = MOD_PAD;
         _loc6_.y = 50;
         _moderateContent.addChild(_loc6_);
         // the close button: a round grey X
         _loc3_ = new Sprite();
         _loc3_.name = "close";
         _loc3_.buttonMode = true;
         _loc3_.useHandCursor = true;
         _loc3_.graphics.beginFill(MOD_GREY);
         _loc3_.graphics.drawCircle(0,0,15);
         _loc3_.graphics.endFill();
         _loc3_.graphics.lineStyle(2.5,0xFFFFFF);
         _loc3_.graphics.moveTo(-5,-5);
         _loc3_.graphics.lineTo(5,5);
         _loc3_.graphics.moveTo(5,-5);
         _loc3_.graphics.lineTo(-5,5);
         _loc3_.x = MOD_W - MOD_PAD - 6;
         _loc3_.y = 32;
         _loc3_.addEventListener("mouseDown",onModerateCloseClick);
         _loc3_.addEventListener("mouseOver",onFlatHover);
         _loc3_.addEventListener("mouseOut",onFlatHover);
         _moderateContent.addChild(_loc3_);
         // warn: a chip for each reason, and Warn
         modSection("Warn",84);
         _loc5_ = 0;
         while(_loc5_ < MODERATE_REASONS.length)
         {
            _loc3_ = modButton("reason" + _loc5_,MODERATE_REASON_NAMES[_loc5_],_loc4_,102,_loc5_ == 2 ? 104 : 82,MOD_GREY,"player.warn");
            _loc4_ += _loc3_.width + 8;
            _loc5_++;
         }
         modButton("warn","Warn",_loc2_[2] + _loc1_ - 120,102,120,MOD_AMBER,"player.warn");
         // the text: a message, or the warning in the staff member's words
         modSection("Message, or your own warning",150);
         var _loc7_:Sprite = new Sprite();
         _loc7_.x = MOD_PAD;
         _loc7_.y = 168;
         _loc7_.graphics.lineStyle(1,MOD_EDGE);
         _loc7_.graphics.beginFill(MOD_FIELD);
         _loc7_.graphics.drawRoundRect(0,0,_loc2_[2] - MOD_PAD - 10,34,14,14);
         _loc7_.graphics.endFill();
         _moderateContent.addChild(_loc7_);
         _moderateHint = modText("Type here, then Send it or press Warn",13,0x6E7187,false);
         _moderateHint.x = 12;
         _moderateHint.y = int((34 - _moderateHint.height) * 0.5);
         _loc7_.addChild(_moderateHint);
         _moderateInput = new TextField();
         _moderateInput.embedFonts = hasGameFont();
         _moderateInput.type = "input";
         _moderateInput.defaultTextFormat = new TextFormat("CCDigitalDelivery",14,0xFFFFFF,false);
         _moderateInput.maxChars = 200;
         _moderateInput.x = 10;
         _moderateInput.y = 7;
         _moderateInput.width = _loc2_[2] - MOD_PAD - 30;
         _moderateInput.height = 22;
         _moderateInput.addEventListener("change",onModerateTyped);
         _loc7_.addChild(_moderateInput);
         modButton("message","Send",_loc2_[2],168,_loc1_,MOD_BLUE,"player.warn");
         modSection("Chat",218);
         modButton("silence 1","Silence 1 hour",_loc2_[0],236,_loc1_,MOD_PURPLE,"chat.silence");
         modButton("silence 24","Silence 1 day",_loc2_[1],236,_loc1_,MOD_PURPLE,"chat.silence");
         modButton("silence off","Lift silence",_loc2_[2],236,_loc1_,MOD_GREY,"chat.silence");
         modSection("Move",286);
         modButton("summon","Bring here",_loc2_[0],304,_loc1_,MOD_TEAL,"player.summon");
         modButton("goto","Go to them",_loc2_[1],304,_loc1_,MOD_TEAL,"player.goto");
         modButton("kick","Disconnect",_loc2_[2],304,_loc1_,MOD_RED,"player.kick");
         modSection("Record, and you",354);
         modButton("warnings","Warnings",_loc2_[0],372,_loc1_,MOD_GREY,"player.warn");
         modButton("unwarn","Undo warning",_loc2_[1],372,_loc1_,MOD_GREY,"player.warn");
         modButton("invisible","Go invisible",_loc2_[2],372,_loc1_,MOD_GREY,"staff.invisible");
         modSection("Name",422);
         modButton("reject","Reject username",_loc2_[0],440,_loc1_,MOD_RED,"player.names");
         _moderate.addEventListener("mouseDown",onFinderMouse);
         _moderate.addEventListener("mouseUp",onFinderMouse);
         _moderate.addEventListener("click",onFinderMouse);
         _moderate.addEventListener("mouseWheel",onFinderMouse);
         _moderate.visible = false;
         addChild(_moderate);
      }

      private function onModerateTyped(param1:Event) : void
      {
         _moderateHint.visible = _moderateInput.text.length == 0;
         showModerateReason();
      }

      private function showModerate(param1:String) : void
      {
         if(_moderate == null)
         {
            buildModerate();
         }
         _moderateName = param1;
         _moderateReason = 0;
         _moderateTitle.text = "Moderate " + param1;
         _moderateInput.text = "";
         _moderateHint.visible = true;
         for each(var _loc2_:Object in _moderateButtons)
         {
            _loc2_.clip.visible = staffMay(_loc2_.permission);
         }
         _moderateInput.parent.visible = staffMay("player.warn");
         modSetLabel(_moderateContent.getChildByName("invisible") as Sprite,staffInvisible ? "Be seen" : "Go invisible");
         showModerateReason();
         _moderate.visible = true;
         setChildIndex(_moderate,numChildren - 1);
      }

      // the chosen reason's chip is lit; with text typed none is (the text is
      // the warning), and Warn says so.
      private function showModerateReason() : void
      {
         var _loc1_:Boolean = _moderateInput.text.replace(/^\s+|\s+$/g,"").length > 0;
         var _loc2_:int = 0;
         var _loc3_:Sprite = null;
         while(_loc2_ < MODERATE_REASONS.length)
         {
            _loc3_ = _moderateContent.getChildByName("reason" + _loc2_) as Sprite;
            paintFlatButton(_loc3_,_loc3_.width,!_loc1_ && _loc2_ == _moderateReason ? MOD_AMBER : MOD_GREY);
            _loc3_.alpha = _loc1_ ? 0.45 : 1;
            _loc2_++;
         }
         modSetLabel(_moderateContent.getChildByName("warn") as Sprite,_loc1_ ? "Warn with text" : "Warn");
      }

      private function hideModerate() : void
      {
         if(_moderate != null)
         {
            _moderate.visible = false;
         }
         gMainFrame.stage.focus = null;
      }

      private function onModerateCloseClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         hideModerate();
      }

      private function onModerateButton(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         var _loc2_:String = Sprite(param1.currentTarget).name;
         var _loc3_:String = null;
         if(_loc2_.indexOf("reason") == 0)
         {
            _moderateReason = int(_loc2_.substr(6));
            showModerateReason();
            return;
         }
         if(_loc2_ == "invisible")
         {
            gMainFrame.server.setXtObject_Str("xiv",[]);
            hideModerate();
            return;
         }
         // "%" ends a field of the message: left out.
         _loc3_ = _moderateInput.text.split("%").join("").replace(/^\s+|\s+$/g,"");
         if(_loc2_ == "warn" && _loc3_.length > 0)
         {
            gMainFrame.server.setXtObject_Str("xmd",["warn",_moderateName,"custom",_loc3_]);
         }
         else if(_loc2_ == "warn")
         {
            gMainFrame.server.setXtObject_Str("xmd",["warn",_moderateName,MODERATE_REASONS[_moderateReason]]);
         }
         else if(_loc2_ == "message")
         {
            if(_loc3_.length == 0)
            {
               gMainFrame.stage.focus = _moderateInput;
               return;
            }
            gMainFrame.server.setXtObject_Str("xmd",["message",_moderateName,_loc3_]);
         }
         else if(_loc2_.indexOf("silence ") == 0)
         {
            gMainFrame.server.setXtObject_Str("xmd",["silence",_moderateName,_loc2_.substr(8)]);
         }
         else
         {
            gMainFrame.server.setXtObject_Str("xmd",[_loc2_,_moderateName]);
         }
         hideModerate();
      }

      // ---- emoji in chat. the game's text box takes nothing from Windows'
      // emoji panel, so they are put in from here: a button at the end of the
      // chat box opens a grid of them (Twemoji's pictures, from the server's
      // /emoji/), and ":name:" in a line becomes the emoji when it is sent
      // (unless it is one of the game's own emote codes, which win). the
      // bubble draws them (gui.ChatBalloon). each is its name and its code
      // points in hex, as Twemoji names its pictures.
      private static const EMOJI_LIST:String = "smile:1f604,grin:1f601,joy:1f602,rofl:1f923,smiley:1f603,wink:1f609,blush:1f60a,innocent:1f607,"
         + "heart_eyes:1f60d,kissing_heart:1f618,star_struck:1f929,partying:1f973,sunglasses:1f60e,nerd:1f913,thinking:1f914,"
         + "neutral:1f610,expressionless:1f611,rolling_eyes:1f644,smirk:1f60f,relieved:1f60c,sleeping:1f634,yum:1f60b,"
         + "tongue:1f61b,zany:1f92a,shush:1f92b,cry:1f622,sob:1f62d,pleading:1f97a,angry:1f620,rage:1f621,scream:1f631,"
         + "flushed:1f633,cold:1f976,hot:1f975,skull:1f480,ghost:1f47b,alien:1f47d,robot:1f916,clown:1f921,poop:1f4a9,"
         + "thumbsup:1f44d,thumbsdown:1f44e,clap:1f44f,wave:1f44b,ok_hand:1f44c,pray:1f64f,muscle:1f4aa,raised_hands:1f64c,"
         + "v:270c,point_up:261d,eyes:1f440,heart:2764,orange_heart:1f9e1,yellow_heart:1f49b,green_heart:1f49a,"
         + "blue_heart:1f499,purple_heart:1f49c,black_heart:1f5a4,white_heart:1f90d,broken_heart:1f494,sparkling_heart:1f496,"
         + "two_hearts:1f495,fire:1f525,sparkles:2728,star:2b50,zap:26a1,boom:1f4a5,rainbow:1f308,sunny:2600,cloud:2601,"
         + "snowflake:2744,moon:1f319,tada:1f389,confetti:1f38a,balloon:1f388,gift:1f381,crown:1f451,gem:1f48e,trophy:1f3c6,"
         + "100:1f4af,check:2705,x:274c,warning:26a0,question:2753,exclamation:2757,music:1f3b5,video_game:1f3ae,dog:1f436,"
         + "cat:1f431,wolf:1f43a,fox:1f98a,bunny:1f430,bear:1f43b,panda:1f43c,tiger:1f42f,lion:1f981,monkey:1f435,"
         + "penguin:1f427,koala:1f428,horse:1f434,unicorn:1f984,owl:1f989,frog:1f438,turtle:1f422,snake:1f40d,dolphin:1f42c,"
         + "whale:1f433,shark:1f988,octopus:1f419,butterfly:1f98b,bee:1f41d,cherry_blossom:1f338,rose:1f339,sunflower:1f33b,"
         + "tree:1f333,cactus:1f335,mushroom:1f344,apple:1f34e,pizza:1f355,hamburger:1f354,fries:1f35f,cake:1f382,cookie:1f36a,"
         + "ice_cream:1f366,candy:1f36c,coffee:2615,house:1f3e0,rocket:1f680,ocean:1f30a,earth:1f30d,pumpkin:1f383,"
         + "christmas_tree:1f384,snowman:2603,crystal_ball:1f52e,magic:1fa84,paw:1f43e,feather:1fab6,leaf:1f343,four_leaf:1f340";

      private static const EMOJI_COLUMNS:int = 14;

      private static const EMOJI_CELL:int = 26;

      private static var _emojiTable:Array; // [{name, hex, chars}]

      private static var _emojiByName:Object;

      private var _emojiButton:Sprite;

      private var _emojiPanel:Sprite;

      private var _emojiHint:TextField;

      private var _emojiField:TextField;

      private var _emojiCaret:int = -1;

      private var _emojiTimer:Timer;

      // the characters of code points in hex ("1f468-200d-1f469")
      public static function charsOfHex(param1:String) : String
      {
         var _loc2_:String = "";
         var _loc3_:int = 0;
         for each(var _loc4_:String in param1.split("-"))
         {
            _loc3_ = parseInt(_loc4_,16);
            if(_loc3_ > 0xFFFF)
            {
               _loc3_ -= 0x10000;
               _loc2_ += String.fromCharCode(0xD800 + (_loc3_ >> 10),0xDC00 + (_loc3_ & 0x3FF));
            }
            else
            {
               _loc2_ += String.fromCharCode(_loc3_);
            }
         }
         return _loc2_;
      }

      private static function emojiTable() : Array
      {
         if(_emojiTable == null)
         {
            _emojiTable = [];
            _emojiByName = {};
            for each(var _loc1_:String in EMOJI_LIST.split(","))
            {
               var _loc2_:Array = _loc1_.split(":");
               var _loc3_:Object = {"name":_loc2_[0],"hex":_loc2_[1],"chars":charsOfHex(_loc2_[1])};
               _emojiTable.push(_loc3_);
               _emojiByName[_loc3_.name] = _loc3_.chars;
            }
         }
         return _emojiTable;
      }

      // a line about to be sent: each ":name:" of an emoji above becomes it,
      // but not the game's own emote codes (":happy:", ":joy:"), which the
      // bubble shows as the game's.
      public static function emojiShortcodes(param1:String) : String
      {
         if(param1.indexOf(":") == -1)
         {
            return param1;
         }
         emojiTable();
         return param1.replace(/:([a-z0-9_]{1,30}):/g,function(param1:String, param2:String, ... rest):String
         {
            if(EmoticonUtility.doesStringMatchAnEmote(param1) || _emojiByName[param2] == null)
            {
               return param1;
            }
            return _emojiByName[param2];
         });
      }

      // a line about to be sent, its emoji as "\{1f600}" (their pictures'
      // names): the game's socket carries characters past U+FFFF badly, and
      // these are plain letters. the bubble draws them (gui.ChatBalloon).
      public static function emojiToTokens(param1:String) : String
      {
         var _loc2_:String = "";
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         while(_loc3_ < param1.length)
         {
            _loc4_ = ChatBalloon.emojiLength(param1,_loc3_);
            if(_loc4_ > 0)
            {
               _loc2_ += "\\{" + ChatBalloon.emojiName(param1.substr(_loc3_,_loc4_)) + "}";
               _loc3_ += _loc4_;
            }
            else
            {
               _loc2_ += param1.charAt(_loc3_);
               _loc3_++;
            }
         }
         return _loc2_;
      }

      // a line for the chat history's list, which has no pictures: each emoji
      // as its name (":fire:"), or ":emoji:" for one not in the grid.
      public static function emojiAsNames(param1:String) : String
      {
         if(param1.indexOf("\\{") == -1)
         {
            return param1;
         }
         emojiTable();
         return param1.replace(/\\\{([0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,9})\}/g,function(param1:String, param2:String, ... rest):String
         {
            for each(var _loc4_:Object in _emojiTable)
            {
               if(_loc4_.hex == param2 || ChatBalloon.emojiName(_loc4_.chars) == param2)
               {
                  return ":" + _loc4_.name + ":";
               }
            }
            return ":emoji:";
         });
      }

      // tags: "@name" in chat and on Jammer Walls, when the name is a
      // player's, is drawn light blue and underlined, and opens that player's
      // card when clicked. which names are players' the server says (xmn,
      // lib/world.js): the longest name the text after the "@" starts with,
      // spaces and all ("@John Smith hi"), ending where a word does. a "@"
      // counts at the start or after a character no name has ("me@home" is
      // no tag). what is no player's name stays plain text.
      public static const MENTION_COLOR:uint = 4895732; // #4ab3f4

      private static const MENTION_TEXT:int = 40; // characters after an "@" asked about

      private static const MENTION_ASK_MOST:int = 10; // texts in one question, as the server takes

      private static const MENTION_WAIT_MS:int = 3000; // no answer by then: no tags in that text

      private static const MENTION_KEEP:int = 2000; // answers kept before starting over

      private static var _mentionKnown:Object = {}; // lowercased text after an "@" -> {length, name} or null

      private static var _mentionKnownCount:int = 0;

      private static var _mentionOnline:Object = {}; // lowercased name -> 1 | 0, as last heard

      private static var _mentionAsks:Object = {}; // question id -> {texts, finish}

      private static var _mentionNextId:int = 1;

      // the "@"s that could start a tag: [{at, text}], `text` what follows,
      // up to a "%" or a line's end (neither is in a name).
      private static function mentionStarts(param1:String) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:int = param1 == null ? -1 : param1.indexOf("@");
         var _loc4_:String = null;
         var _loc5_:String = null;
         while(_loc3_ != -1)
         {
            _loc4_ = _loc3_ > 0 ? param1.charAt(_loc3_ - 1) : " ";
            if(!/[A-Za-z0-9.\-@]/.test(_loc4_) && /[A-Za-z0-9]/.test(param1.charAt(_loc3_ + 1)))
            {
               _loc5_ = param1.substr(_loc3_ + 1,MENTION_TEXT).split("%")[0].split("\r")[0].split("\n")[0];
               _loc2_.push({
                  "at":_loc3_,
                  "text":_loc5_
               });
            }
            _loc3_ = param1.indexOf("@",_loc3_ + 1);
         }
         return _loc2_;
      }

      // [{at, length, name}] for the starts the server has said are tags:
      // `at` at the "@", `length` with it, `name` as the account spells it.
      private static function mentionsFound(param1:Array) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:Object = null;
         var _loc4_:Object = null;
         for each(_loc3_ in param1)
         {
            _loc4_ = _mentionKnown[String(_loc3_.text).toLowerCase()];
            if(_loc4_ != null)
            {
               _loc2_.push({
                  "at":_loc3_.at,
                  "length":_loc4_.length + 1,
                  "name":_loc4_.name
               });
            }
         }
         return _loc2_;
      }

      // the tags in a text, given to `param2` as [{at, length, name}]: at
      // once when every name in it is known, else when the server answers
      // (or does not, in MENTION_WAIT_MS: then only the known ones).
      public static function resolveMentions(param1:String, param2:Function) : void
      {
         var _loc3_:Array = mentionStarts(param1);
         var _loc4_:Array = [];
         var _loc5_:Array = [];
         var _loc6_:Object = null;
         var _loc7_:String = null;
         var _loc8_:int = 0;
         var _loc9_:Function = null;
         for each(_loc6_ in _loc3_)
         {
            _loc7_ = String(_loc6_.text).toLowerCase();
            if(!(_loc7_ in _mentionKnown) && _loc5_.indexOf(_loc7_) == -1 && _loc4_.length < MENTION_ASK_MOST)
            {
               _loc5_.push(_loc7_);
               _loc4_.push(_loc6_.text);
            }
         }
         if(_loc4_.length == 0)
         {
            param2(mentionsFound(_loc3_));
            return;
         }
         _loc8_ = _mentionNextId++;
         _loc9_ = function():void
         {
            if(_loc8_ in _mentionAsks)
            {
               delete _mentionAsks[_loc8_];
               param2(mentionsFound(_loc3_));
            }
         };
         _mentionAsks[_loc8_] = {
            "texts":_loc4_,
            "finish":_loc9_
         };
         gMainFrame.server.setXtObject_Str("xmn",[_loc8_].concat(_loc4_));
         setTimeout(_loc9_,MENTION_WAIT_MS);
      }

      // "xmn": [.., .., id, then for each text asked about: length of the
      // name it starts with (0: none), the name, 1 if they are online].
      public static function onMentions(param1:Object) : void
      {
         var _loc2_:Object = _mentionAsks[int(param1[2])];
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         var _loc5_:String = null;
         if(_loc2_ == null)
         {
            return;
         }
         if(_mentionKnownCount > MENTION_KEEP)
         {
            _mentionKnown = {};
            _mentionKnownCount = 0;
         }
         _loc3_ = 0;
         while(_loc3_ < _loc2_.texts.length && 5 + _loc3_ * 3 < param1.length)
         {
            _loc4_ = int(param1[3 + _loc3_ * 3]);
            _loc5_ = String(param1[4 + _loc3_ * 3]);
            _mentionKnown[String(_loc2_.texts[_loc3_]).toLowerCase()] = _loc4_ > 0 ? {
               "length":_loc4_,
               "name":_loc5_
            } : null;
            _mentionKnownCount++;
            if(_loc4_ > 0)
            {
               _mentionOnline[_loc5_.toLowerCase()] = int(param1[5 + _loc3_ * 3]);
            }
            _loc3_++;
         }
         _loc2_.finish();
      }

      // colours tags (resolveMentions) in a text field that reads as it did
      // then: MENTION_COLOR, or `param4` when given. with `param3`, each is
      // also a link ("event:@name", heard as a "link" event).
      public static function styleMentions(param1:TextField, param2:Array, param3:Boolean, param4:int = -1) : void
      {
         var _loc4_:Object = null;
         var _loc5_:TextFormat = null;
         if(param1 == null || param2 == null)
         {
            return;
         }
         for each(_loc4_ in param2)
         {
            if(_loc4_.at + _loc4_.length <= param1.length)
            {
               _loc5_ = new TextFormat();
               _loc5_.color = param4 >= 0 ? param4 : MENTION_COLOR;
               _loc5_.underline = true;
               if(param3)
               {
                  _loc5_.url = "event:@" + _loc4_.name;
               }
               param1.setTextFormat(_loc5_,_loc4_.at,_loc4_.at + _loc4_.length);
            }
         }
      }

      // the name of the tag under the mouse in a text field, or null.
      public static function mentionAt(param1:TextField, param2:Array) : String
      {
         var _loc3_:int = param1 == null || param2 == null ? -1 : param1.getCharIndexAtPoint(param1.mouseX,param1.mouseY);
         var _loc4_:Object = null;
         if(_loc3_ < 0)
         {
            return null;
         }
         for each(_loc4_ in param2)
         {
            if(_loc3_ >= _loc4_.at && _loc3_ < _loc4_.at + _loc4_.length)
            {
               return _loc4_.name;
            }
         }
         return null;
      }

      // a tagged player's card (the server has said the name is theirs).
      public static function openProfile(param1:String) : void
      {
         var _loc2_:Buddy = null;
         if(param1 == null || param1 == "")
         {
            return;
         }
         _loc2_ = BuddyManager.getBuddyByUserName(param1);
         BuddyManager.showBuddyCard({
            "userName":(_loc2_ != null ? _loc2_.userName : param1),
            "onlineStatus":(_loc2_ != null ? _loc2_.onlineStatus : int(_mentionOnline[param1.toLowerCase()]))
         });
      }

      // a tag's background, as Discord draws a mention: a rounded box of
      // the tag's colour, see-through, behind its words (one a line, should a
      // tag wrap). a text field has no background for part of its text, so
      // it is drawn on a Shape just under the field (over it, faintly, if
      // the field paints its own background), kept a field.
      // how strong the box is: the chat log's dark panel shows a fainter one
      // well, the white balloons and the wall posts need it stronger (a
      // balloon is see-through itself).
      public static const MENTION_BACK_DARK:Number = 0.4;

      public static const MENTION_BACK_LIGHT:Number = 0.6;

      private static var _mentionBacks:Dictionary = new Dictionary(true); // text field -> Shape

      // the tags in a text field whose tags are links ("event:@name", the
      // chat log's): [{at, length}].
      public static function mentionLinks(param1:TextField) : Array
      {
         var _loc2_:Array = [];
         var _loc3_:String = param1 == null ? "" : param1.text;
         var _loc4_:int = _loc3_.indexOf("@");
         var _loc5_:String = null;
         var _loc6_:int = 0;
         while(_loc4_ != -1)
         {
            _loc5_ = param1.getTextFormat(_loc4_,_loc4_ + 1).url;
            if(_loc5_ != null && _loc5_.indexOf("event:@") == 0)
            {
               _loc6_ = _loc4_ + 1;
               while(_loc6_ < _loc3_.length && param1.getTextFormat(_loc6_,_loc6_ + 1).url == _loc5_)
               {
                  _loc6_++;
               }
               _loc2_.push({
                  "at":_loc4_,
                  "length":_loc6_ - _loc4_
               });
               _loc4_ = _loc3_.indexOf("@",_loc6_);
            }
            else
            {
               _loc4_ = _loc3_.indexOf("@",_loc4_ + 1);
            }
         }
         return _loc2_;
      }

      // draws the backgrounds of `param2` ([{at, length}]) for a text field
      // as it is laid out and scrolled now, `param3` strong; none, with no tags.
      public static function drawMentionBacks(param1:TextField, param2:Array, param3:Number = 0.6) : void
      {
         var _loc3_:Shape = _mentionBacks[param1];
         var _loc4_:Object = null;
         var _loc5_:Object = null;
         var _loc6_:Object = null;
         var _loc7_:Rectangle = null;
         var _loc8_:int = 0;
         var _loc9_:int = 0;
         var _loc10_:int = 0;
         var _loc11_:int = 0;
         var _loc12_:Number = 0;
         var _loc13_:int = 0;
         if(param1 == null)
         {
            return;
         }
         if(_loc3_ == null)
         {
            if(param2 == null || param2.length == 0)
            {
               return;
            }
            _loc3_ = new Shape();
            _mentionBacks[param1] = _loc3_;
         }
         _loc3_.graphics.clear();
         if(param1.parent == null || param2 == null || param2.length == 0)
         {
            return;
         }
         if(_loc3_.parent != null)
         {
            _loc3_.parent.removeChild(_loc3_);
         }
         _loc13_ = param1.parent.getChildIndex(param1);
         param1.parent.addChildAt(_loc3_,param1.background ? _loc13_ + 1 : _loc13_);
         _loc3_.transform.matrix = param1.transform.matrix;
         // only the lines in view; their place as the field is scrolled now
         _loc9_ = param1.scrollV - 1;
         _loc10_ = param1.bottomScrollV - 1;
         if(_loc9_ > 0)
         {
            _loc7_ = param1.getCharBoundaries(param1.getLineOffset(_loc9_));
            _loc12_ = _loc7_ != null ? _loc7_.y - 2 : 0;
         }
         for each(_loc4_ in param2)
         {
            _loc5_ = {};
            _loc8_ = _loc4_.at;
            while(_loc8_ < _loc4_.at + _loc4_.length && _loc8_ < param1.length)
            {
               _loc11_ = param1.getLineIndexOfChar(_loc8_);
               _loc7_ = _loc11_ >= _loc9_ && _loc11_ <= _loc10_ ? param1.getCharBoundaries(_loc8_) : null;
               if(_loc7_ != null && _loc7_.width > 0)
               {
                  _loc6_ = _loc5_[_loc11_];
                  if(_loc6_ == null)
                  {
                     _loc5_[_loc11_] = {
                        "left":_loc7_.x,
                        "right":_loc7_.x + _loc7_.width,
                        "top":_loc7_.y,
                        "height":_loc7_.height
                     };
                  }
                  else
                  {
                     _loc6_.left = Math.min(_loc6_.left,_loc7_.x);
                     _loc6_.right = Math.max(_loc6_.right,_loc7_.x + _loc7_.width);
                     _loc6_.height = Math.max(_loc6_.height,_loc7_.height);
                  }
               }
               _loc8_++;
            }
            for each(_loc6_ in _loc5_)
            {
               _loc3_.graphics.beginFill(MENTION_COLOR,param3);
               _loc3_.graphics.drawRoundRect(_loc6_.left - 3,_loc6_.top - _loc12_,_loc6_.right - _loc6_.left + 6,_loc6_.height,8,8);
               _loc3_.graphics.endFill();
            }
         }
      }

      // sound settings (MySettings' Music and SFX sliders): music and sound
      // effects apart, each a volume from 0 to 1, kept on this computer in
      // the game's shared object (musicVolume, sfxVolume). both start at the
      // game's one old volume ("volume"), which is then left at full under
      // them.
      // music: every SBMusic (the rooms', the minigames' streams). sound
      // effects: every SBSound (the interface's too), the minigames'
      // SoundManager sounds, and what artwork plays by itself (gMainFrame's
      // soundTransform; music plays apart from the display, so not under it).
      // the HUD's speaker button still turns everything off and on.
      private static var _musicVolume:Number = 1;

      private static var _sfxVolume:Number = 1;

      public static function musicLevel() : Number
      {
         return _musicVolume;
      }

      public static function sfxLevel() : Number
      {
         return _sfxVolume;
      }

      // "music" or "sfx"
      public static function soundVolume(param1:String) : Number
      {
         return param1 == "music" ? _musicVolume : _sfxVolume;
      }

      private static function volumeFrom(param1:*, param2:Number) : Number
      {
         var _loc3_:Number = param1 == null ? param2 : Number(param1);
         return isNaN(_loc3_) ? param2 : Math.max(0,Math.min(1,_loc3_));
      }

      // once the game has read its shared object (GuiManager.setupSharedObject)
      public static function loadSoundSettings() : void
      {
         var _loc1_:Object = GuiManager.sharedObj != null ? GuiManager.sharedObj.data : null;
         var _loc2_:Number = volumeFrom(_loc1_ != null ? _loc1_.volume : null,1);
         _musicVolume = volumeFrom(_loc1_ != null ? _loc1_.musicVolume : null,_loc2_);
         _sfxVolume = volumeFrom(_loc1_ != null ? _loc1_.sfxVolume : null,_loc2_);
         if(SBAudio.currentVolume != 1)
         {
            SBAudio.setVolumeAll(1);
         }
         applySoundSettings();
      }

      // a volume (0 to 1); `param3` keeps it (a slider being dragged does
      // not, until it is let go)
      public static function setSoundVolume(param1:String, param2:Number, param3:Boolean = true) : void
      {
         param2 = volumeFrom(param2,1);
         if(param1 == "music")
         {
            _musicVolume = param2;
         }
         else
         {
            _sfxVolume = param2;
         }
         applySoundSettings();
         if(param3)
         {
            saveSoundSettings();
         }
      }

      public static function saveSoundSettings() : void
      {
         if(GuiManager.sharedObj == null)
         {
            return;
         }
         GuiManager.sharedObj.data.musicVolume = _musicVolume;
         GuiManager.sharedObj.data.sfxVolume = _sfxVolume;
         try
         {
            GuiManager.sharedObj.flush();
         }
         catch(e:Error)
         {
         }
      }

      private static function applySoundSettings() : void
      {
         SBMusic.refreshAll();
         SBSound.refreshAll();
         if(gMainFrame != null)
         {
            gMainFrame.soundTransform = new SoundTransform(sfxLevel());
         }
      }

      // where the player is, for the client's Discord rich presence (game.html
      // ajPresence, the client's app/discord.js): the room's name as the game
      // shows it, but never another player's name: a den or a player's party
      // is named after its owner, so it is only "In their den", "Visiting a
      // den" and the like. which room it is goes by its name on the server
      // (lib/world.js): "den<owner>", "pparty<host>", "party<id>_<den>".
      private static var _presenceShown:String = null;

      public static function presenceRoom(param1:String) : void
      {
         var _loc2_:String = "";
         var _loc3_:String = gMainFrame.userInfo.myUserName != null ? String(gMainFrame.userInfo.myUserName).toLowerCase() : "";
         var _loc4_:String = null;
         try
         {
            _loc2_ = String(gMainFrame.server.getCurrentRoomName() || "");
         }
         catch(e:Error)
         {
         }
         if(_loc2_.indexOf("den") == 0)
         {
            _loc4_ = _loc2_.substr(3).toLowerCase() == _loc3_ ? "In their den" : "Visiting a den";
         }
         else if(_loc2_.indexOf("pparty") == 0)
         {
            _loc4_ = _loc2_.substr(6).toLowerCase() == _loc3_ ? "Hosting a party" : "At a party";
         }
         else if(_loc2_.indexOf("party") == 0 && _loc2_.indexOf("_") != -1)
         {
            _loc4_ = "At a party";
         }
         else
         {
            _loc4_ = param1 != null && param1 != "" ? "In " + param1 : "Playing";
         }
         if(_loc4_ == _presenceShown || !ExternalInterface.available)
         {
            return;
         }
         _presenceShown = _loc4_;
         try
         {
            ExternalInterface.call("ajPresence",_loc4_);
         }
         catch(e:Error)
         {
         }
      }

      private function startEmojiButton() : void
      {
         _emojiTimer = new Timer(500);
         _emojiTimer.addEventListener("timer",placeEmojiButton);
         _emojiTimer.start();
         gMainFrame.stage.addEventListener("mouseDown",onEmojiStageDown,false,0,true);
      }

      private static function shownOnStage(param1:DisplayObject) : Boolean
      {
         if(param1 == null || param1.stage == null)
         {
            return false;
         }
         while(param1 != null)
         {
            if(!param1.visible)
            {
               return false;
            }
            param1 = param1.parent;
         }
         return true;
      }

      // the button, kept at the right end of the chat box while it is shown
      private function placeEmojiButton(param1:Event = null) : void
      {
         var _loc2_:TextField = null;
         var _loc3_:Point = null;
         try
         {
            _loc2_ = GuiManager.chatHist != null ? GuiManager.chatHist.chatMsgText : null;
         }
         catch(e:Error)
         {
            _loc2_ = null;
         }
         if(_emojiButton == null)
         {
            _emojiButton = new Sprite();
            _emojiButton.buttonMode = true;
            _emojiButton.useHandCursor = true;
            _emojiButton.graphics.lineStyle(2,8349508);
            _emojiButton.graphics.beginFill(16774084);
            _emojiButton.graphics.drawCircle(0,0,12);
            _emojiButton.graphics.endFill();
            var _loc4_:Sprite = new Sprite();
            _loc4_.mouseEnabled = false;
            _loc4_.mouseChildren = false;
            loadArt(gMainFrame.clientInfo.websiteURL + "emoji/1f600.png",_loc4_,17,false);
            _emojiButton.addChild(_loc4_);
            _emojiButton.addEventListener("mouseDown",onEmojiButton);
            addChild(_emojiButton);
         }
         // The chat field remains technically visible under darkened game
         // windows (inventory, trading, shops, etc.).  Do not leave the
         // emoji button or its grid sitting above those interfaces.
         var _loc5_:Boolean = shownOnStage(_loc2_) && _loc2_.type == "input" && !DarkenManager.isDarkened && !GuiManager.isModal();
         _emojiButton.visible = _loc5_;
         if(!_loc5_)
         {
            if(_emojiPanel != null)
            {
               _emojiPanel.visible = false;
            }
            return;
         }
         // the box gives up room for it once
         if(_emojiField != _loc2_)
         {
            _emojiField = _loc2_;
            _loc2_.width = Math.max(60,_loc2_.width - 28);
         }
         _loc3_ = globalToLocal(_loc2_.localToGlobal(new Point(_loc2_.width,_loc2_.height * 0.5)));
         _emojiButton.x = int(_loc3_.x + 15);
         _emojiButton.y = int(_loc3_.y);
         if(getChildIndex(_emojiButton) < numChildren - 1 && (_emojiPanel == null || !_emojiPanel.visible))
         {
            setChildIndex(_emojiButton,numChildren - 1);
         }
      }

      private function onEmojiButton(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_emojiPanel == null)
         {
            buildEmojiPanel();
         }
         _emojiCaret = _emojiField != null && gMainFrame.stage.focus == _emojiField ? _emojiField.caretIndex : -1;
         _emojiPanel.visible = !_emojiPanel.visible;
         if(_emojiPanel.visible)
         {
            _emojiPanel.x = int(Math.max(4,_emojiButton.x + 14 - _emojiPanel.width));
            _emojiPanel.y = int(Math.max(4,_emojiButton.y - 18 - _emojiPanel.height));
            setChildIndex(_emojiPanel,numChildren - 1);
            setChildIndex(_emojiButton,numChildren - 1);
         }
      }

      private function buildEmojiPanel() : void
      {
         var _loc1_:Array = emojiTable();
         var _loc2_:int = Math.ceil(_loc1_.length / EMOJI_COLUMNS);
         var _loc3_:int = EMOJI_COLUMNS * EMOJI_CELL + 12;
         var _loc4_:int = _loc2_ * EMOJI_CELL + 36;
         var _loc5_:int = 0;
         _emojiPanel = new Sprite();
         _emojiPanel.graphics.lineStyle(2,8349508);
         _emojiPanel.graphics.beginFill(16774084);
         _emojiPanel.graphics.drawRoundRect(0,0,_loc3_,_loc4_,14,14);
         _emojiPanel.graphics.endFill();
         while(_loc5_ < _loc1_.length)
         {
            var _loc6_:Sprite = new Sprite();
            _loc6_.name = "emoji" + _loc5_;
            _loc6_.x = 6 + (_loc5_ % EMOJI_COLUMNS) * EMOJI_CELL + EMOJI_CELL * 0.5;
            _loc6_.y = 6 + Math.floor(_loc5_ / EMOJI_COLUMNS) * EMOJI_CELL + EMOJI_CELL * 0.5;
            _loc6_.graphics.beginFill(3184463,0);
            _loc6_.graphics.drawRoundRect(-EMOJI_CELL * 0.5,-EMOJI_CELL * 0.5,EMOJI_CELL,EMOJI_CELL,8,8);
            _loc6_.graphics.endFill();
            _loc6_.buttonMode = true;
            _loc6_.useHandCursor = true;
            _loc6_.mouseChildren = false;
            loadArt(gMainFrame.clientInfo.websiteURL + "emoji/" + _loc1_[_loc5_].hex + ".png",_loc6_,20,false);
            _loc6_.addEventListener("mouseDown",onEmojiPick);
            _loc6_.addEventListener("mouseOver",onEmojiHover);
            _loc6_.addEventListener("mouseOut",onEmojiHover);
            _emojiPanel.addChild(_loc6_);
            _loc5_++;
         }
         _emojiHint = new TextField();
         _emojiHint.embedFonts = hasGameFont();
         _emojiHint.selectable = false;
         _emojiHint.mouseEnabled = false;
         _emojiHint.defaultTextFormat = new TextFormat("CCDigitalDelivery",12,6045213,true);
         _emojiHint.width = _loc3_ - 16;
         _emojiHint.height = 20;
         _emojiHint.x = 8;
         _emojiHint.y = _loc4_ - 26;
         _emojiHint.text = "Or type its name, as :fire: or :heart:";
         _emojiPanel.addChild(_emojiHint);
         _emojiPanel.visible = false;
         addChild(_emojiPanel);
      }

      private function onEmojiHover(param1:MouseEvent) : void
      {
         var _loc2_:Sprite = Sprite(param1.currentTarget);
         var _loc3_:Object = emojiTable()[int(_loc2_.name.substr(5))];
         _loc2_.alpha = param1.type == "mouseOver" ? 0.7 : 1;
         _emojiHint.text = param1.type == "mouseOver" ? ":" + _loc3_.name + ":" : "Or type its name, as :fire: or :heart:";
      }

      // an emoji into the chat box, where its cursor was
      private function onEmojiPick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         var _loc2_:Object = emojiTable()[int(Sprite(param1.currentTarget).name.substr(5))];
         var _loc3_:TextField = _emojiField;
         if(_loc3_ == null || _loc3_.text.length + _loc2_.chars.length > _loc3_.maxChars && _loc3_.maxChars > 0)
         {
            return;
         }
         var _loc4_:int = _emojiCaret >= 0 && _emojiCaret <= _loc3_.text.length ? _emojiCaret : _loc3_.text.length;
         _loc3_.replaceText(_loc4_,_loc4_,_loc2_.chars);
         _emojiCaret = _loc4_ + _loc2_.chars.length;
         gMainFrame.stage.focus = _loc3_;
         _loc3_.setSelection(_emojiCaret,_emojiCaret);
         _loc3_.dispatchEvent(new Event("change"));
      }

      // a click anywhere else closes the grid
      private function onEmojiStageDown(param1:MouseEvent) : void
      {
         if(_emojiPanel != null && _emojiPanel.visible && !_emojiPanel.contains(param1.target as DisplayObject) && !_emojiButton.contains(param1.target as DisplayObject))
         {
            _emojiPanel.visible = false;
         }
      }

      // ---- the Item Maker (the settings menu): a player's own item made from
      // one of the game's (the server's lib/playeritems.js), in the look of the
      // game's own windows, as the Item Giver is. two pages: making one (the
      // game's items, looked up as the Item Giver does, "base=1": only those
      // that can be copied) and the player's own (rename, a picture of its own,
      // delete). the server answers "xcm" [ok, what to say, left today, left
      // in all, the player's items as JSON]; a picture goes over HTTP
      // (POST /api/itemart, lib/itemart.js).
      private static const MAKER_ROWS:int = 5;

      private var _maker:Sprite;

      private var _makerContent:MovieClip;

      private var _makerMode:String = "make";

      private var _makerKind:String = "clothing";

      private var _makerStatus:TextField;

      private var _makerSearchBar:MovieClip;

      private var _makerNameBar:MovieClip;

      private var _makerKindButton:MovieClip;

      private var _makerRowsSprite:Sprite;

      private var _makerResults:Array = [];

      private var _makerMine:Array = [];

      private var _makerPage:int = 0;

      private var _makerChosen:Object;

      private var _makerLeft:String = "";

      private var _makerButtons:Object = {};

      private var _makerFile:FileReference;

      private var _makerUploading:Object;

      private var _makerIcons:Array = [];

      // "xcm": the server's answer, for the Item Maker if it is open.
      public static function onItemMaker(param1:Object) : void
      {
         if(_toolsInstance != null)
         {
            try
            {
               _toolsInstance.makerAnswer(param1);
            }
            catch(e:Error)
            {
               GlobalErrorCatch.reportToServer("item maker: " + e + "\n" + e.getStackTrace());
            }
         }
      }

      // a button of the game's, at param3, param4; `param5` says which pages
      // show it.
      private function makerButton(param1:String, param2:String, param3:Number, param4:Number, param5:String, param6:Number = 1) : MovieClip
      {
         var _loc7_:MovieClip = GETDEFINITIONBYNAME("introBtnCont");
         _loc7_.name = param1;
         _loc7_.x = param3;
         _loc7_.y = param4;
         _loc7_.scaleX = _loc7_.scaleY = param6;
         finderButtonText(_loc7_,param2);
         // the file picker opens only for a click
         _loc7_.addEventListener(param1 == "picture" ? "click" : "mouseDown",onMakerButton);
         _makerContent.addChild(_loc7_);
         _makerButtons[param1] = {"clip":_loc7_,"pages":param5};
         return _loc7_;
      }

      private function buildItemMaker() : void
      {
         var _loc1_:MovieClip = GETDEFINITIONBYNAME("ReportRulesPopupSkin");
         var _loc2_:int = 1;
         var _loc3_:MovieClip = null;
         _maker = new Sprite();
         _maker.graphics.beginFill(0,0.45);
         _maker.graphics.drawRect(0,0,900,550);
         _maker.graphics.endFill();
         var _loc4_:Sprite = new Sprite();
         _loc4_.x = 450;
         _loc4_.y = 275;
         _maker.addChild(_loc4_);
         _loc4_.addChild(_loc1_);
         _makerContent = GETDEFINITIONBYNAME("ReportRulesPopupContent");
         _makerContent.x = _loc1_.c.x;
         _makerContent.y = _loc1_.c.y;
         _loc4_.addChild(_makerContent);
         _loc1_.bx.addEventListener("mouseDown",function(param1:MouseEvent):void
         {
            param1.stopPropagation();
            showItemMaker(false);
         });
         while(_loc2_ <= 5)
         {
            _makerContent["ruleTxt" + _loc2_].visible = false;
            _makerContent["ruleBodyTxt" + _loc2_].visible = false;
            _loc2_++;
         }
         _makerContent.titleTxt.text = "Item Maker";
         _makerStatus = _makerContent.ruleBodyTxt1;
         _makerStatus.visible = true;
         _makerStatus.wordWrap = true;
         _makerStatus.x = -245;
         _makerStatus.y = -116;
         _makerStatus.width = 490;
         _makerStatus.height = 44;
         // the bars and the kind, over the list
         _makerSearchBar = finderSearchBar(-247,-160,212,"Search the game's items",null,40,true);
         _makerContent.addChild(_makerSearchBar);
         _makerKindButton = makerButton("kind","Clothing",-30,-156,"make");
         _makerNameBar = finderSearchBar(93,-160,156,"Your item's name","A-Za-z0-9 '&!?.,:()#+\\-",40,false);
         _makerContent.addChild(_makerNameBar);
         _makerRowsSprite = new Sprite();
         _makerRowsSprite.y = -54;
         _makerContent.addChild(_makerRowsSprite);
         _loc3_ = GETDEFINITIONBYNAME("arrow_l_btnContOld");
         _loc3_.x = -228;
         _loc3_.y = 166;
         _loc3_.name = "prev";
         _loc3_.addEventListener("mouseDown",onMakerButton);
         _makerContent.addChild(_loc3_);
         _loc3_ = GETDEFINITIONBYNAME("arrow_r_btnContOld");
         _loc3_.x = 228;
         _loc3_.y = 166;
         _loc3_.name = "next";
         _loc3_.addEventListener("mouseDown",onMakerButton);
         _makerContent.addChild(_loc3_);
         // making one
         makerButton("make","Make it",-175,148,"make");
         makerButton("mine","My items",-58,148,"make");
         makerButton("search","Search",59,148,"make");
         // their own: what the bar's name, a picture or a delete does to the one chosen
         makerButton("rename","Rename",-215,148,"mine",0.72);
         makerButton("picture","Picture",-128,148,"mine",0.72);
         makerButton("look","Look",-41,148,"mine",0.72);
         makerButton("delete","Delete",46,148,"mine",0.72);
         makerButton("back","Make more",133,148,"mine",0.72);
         _maker.addEventListener("mouseDown",onFinderMouse);
         _maker.addEventListener("mouseUp",onFinderMouse);
         _maker.addEventListener("click",onFinderMouse);
         _maker.addEventListener("mouseWheel",onFinderMouse);
         _maker.visible = false;
         addChild(_maker);
      }

      private function showItemMaker(param1:Boolean) : void
      {
         if(!param1)
         {
            if(_maker != null)
            {
               _maker.visible = false;
            }
            gMainFrame.stage.focus = null;
            return;
         }
         if(_maker == null)
         {
            buildItemMaker();
         }
         _makerChosen = null;
         _makerNameBar.searchTxt.text = "";
         _makerNameBar.txt.visible = true;
         makerMode("make");
         _maker.visible = true;
         setChildIndex(_maker,numChildren - 1);
         gMainFrame.stage.focus = _makerSearchBar.searchTxt;
         gMainFrame.server.setXtObject_Str("xcm",["info"]);
         makerSearch();
      }

      private function makerMode(param1:String) : void
      {
         _makerMode = param1;
         _makerPage = 0;
         _makerChosen = null;
         for each(var _loc2_:Object in _makerButtons)
         {
            _loc2_.clip.visible = String(_loc2_.pages).indexOf(param1) != -1;
         }
         _makerSearchBar.visible = param1 == "make";
         _makerNameBar.txt.text = param1 == "make" ? "Your item's name" : "New name";
         makerSay(param1 == "make" ? "Choose one of the game's items, name it, then Make it. " + _makerLeft : "Choose one of your items: rename it (type the name first), give it a picture, change its Look (worn as the picture, or its shape painted with it), or delete it.");
         makerRows();
      }

      private function makerSay(param1:String) : void
      {
         _makerStatus.text = param1;
      }

      private function makerSearch() : void
      {
         var _loc1_:URLLoader = new URLLoader();
         _loc1_.addEventListener("complete",onMakerResults,false,0,false);
         _loc1_.addEventListener("ioError",onMakerFailed,false,0,false);
         _loc1_.addEventListener("securityError",onMakerFailed,false,0,false);
         _loc1_.load(new URLRequest(gMainFrame.clientInfo.websiteURL + "api/search?base=1&kind=" + _makerKind + "&q=" + encodeURIComponent(_makerSearchBar.searchTxt.text)
            + "&username=" + encodeURIComponent(gMainFrame.server.userName) + "&token=" + encodeURIComponent(gMainFrame.clientInfo.authToken)));
      }

      private function onMakerFailed(param1:Event) : void
      {
         makerSay("That did not work. Try again.");
      }

      private function onMakerResults(param1:Event) : void
      {
         try
         {
            _makerResults = JSON.parse(param1.target.data).results as Array;
         }
         catch(e:Error)
         {
            _makerResults = null;
         }
         if(_makerResults == null)
         {
            _makerResults = [];
         }
         _makerPage = 0;
         if(_makerMode == "make")
         {
            makerRows();
            if(_makerResults.length == 0)
            {
               makerSay("Nothing found. Try another word.");
            }
         }
      }

      private function makerList() : Array
      {
         return _makerMode == "make" ? _makerResults : _makerMine;
      }

      // the page of the list shown: a row of the game's for each, its icon
      // (a custom item's own picture, when it has one) beside it.
      private function makerRows() : void
      {
         var _loc1_:Array = makerList();
         var _loc2_:int = _makerPage * MAKER_ROWS;
         var _loc3_:MovieClip = null;
         var _loc4_:Object = null;
         while(_makerRowsSprite.numChildren > 0)
         {
            _makerRowsSprite.removeChildAt(0);
         }
         _makerIcons = [];
         while(_loc2_ < _loc1_.length && _loc2_ < _makerPage * MAKER_ROWS + MAKER_ROWS)
         {
            _loc4_ = _loc1_[_loc2_];
            _loc3_ = GETDEFINITIONBYNAME("textBtnCont");
            _loc3_.x = -40;
            _loc3_.y = (_loc2_ - _makerPage * MAKER_ROWS) * 40;
            _loc3_.name = "row" + _loc2_;
            _loc3_.currTxt.mouseEnabled = false;
            var _loc5_:Boolean = _makerChosen != null && _makerChosen.id == _loc4_.id && _makerChosen.kind == _loc4_.kind;
            _loc3_.currTxt.text = (_loc5_ ? "> " : "") + makerShort(String(_loc4_.name || "(no name)"),24) + (_makerMode == "mine" ? (_loc4_.waiting == "item" ? "  (waiting)" : _loc4_.waiting == "picture" ? "  (picture waiting)" : _loc4_.art ? (_loc4_.kind == "clothing" ? (_loc4_.artMode == "texture" ? "  (texture)" : "  (sticker)") : "  (picture)") : "") : "   #" + _loc4_.id);
            _loc3_.addEventListener("mouseDown",onMakerButton);
            _makerRowsSprite.addChild(_loc3_);
            _makerRowsSprite.addChild(finderPreview(_loc4_,_loc2_,186,_loc3_.y));
            _loc2_++;
         }
         if(_makerMode == "mine" && _loc1_.length == 0)
         {
            makerSay("You have not made any items yet. " + _makerLeft);
         }
      }

      private static function makerShort(param1:String, param2:int) : String
      {
         return param1.length > param2 ? param1.substr(0,param2 - 3) + "..." : param1;
      }

      public function makerAnswer(param1:Object) : void
      {
         if(_maker == null)
         {
            return;
         }
         var _loc2_:String = String(param1[3]);
         try
         {
            _makerMine = JSON.parse(String(param1[6])) as Array;
         }
         catch(e:Error)
         {
            _makerMine = null;
         }
         if(_makerMine == null)
         {
            _makerMine = [];
         }
         _makerMine.reverse(); // the newest first
         // the one chosen on this page, as it is now (its look, its picture)
         if(_makerMode == "mine" && _makerChosen != null)
         {
            var _loc6_:Object = _makerChosen;
            _makerChosen = null;
            for each(var _loc7_:Object in _makerMine)
            {
               if(_loc7_.kind == _loc6_.kind && _loc7_.id == _loc6_.id)
               {
                  _makerChosen = _loc7_;
               }
            }
         }
         _makerLeft = "You can make " + int(param1[4]) + " more today (" + int(param1[5]) + " in all).";
         if(_loc2_.length > 0)
         {
            makerSay(_loc2_);
         }
         else if(_makerMode == "make")
         {
            makerSay("Choose one of the game's items, name it, then Make it. " + _makerLeft);
         }
         if(String(param1[2]) == "1" && _loc2_.length > 0)
         {
            _makerNameBar.searchTxt.text = "";
            _makerNameBar.txt.visible = true;
            _makerChosen = null;
         }
         if(_makerMode == "mine")
         {
            makerRows();
         }
      }

      private function makerName() : String
      {
         return _makerNameBar.searchTxt.text.split("%").join("").replace(/^\s+|\s+$/g,"");
      }

      private function onMakerButton(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         var _loc2_:String = DisplayObject(param1.currentTarget).name;
         var _loc3_:Object = null;
         if(_loc2_.indexOf("row") == 0)
         {
            _makerChosen = makerList()[int(_loc2_.substr(3))];
            if(_makerChosen != null && _makerMode == "make" && _makerNameBar.searchTxt.text.length == 0)
            {
               _makerNameBar.searchTxt.text = String(_makerChosen.name || "").replace(/[^A-Za-z0-9 '&!?.,:()#+\-]/g,"").substr(0,40);
               _makerNameBar.txt.visible = _makerNameBar.searchTxt.text.length == 0;
            }
            if(_makerChosen != null)
            {
               makerSay((_makerMode == "make" ? "Making it from " : "Chosen: ") + _makerChosen.name + ".");
            }
            makerRows();
         }
         else if(_loc2_ == "kind")
         {
            _makerKind = _makerKind == "clothing" ? "den" : "clothing";
            finderButtonText(_makerKindButton,_makerKind == "clothing" ? "Clothing" : "Den items");
            _makerChosen = null;
            makerSearch();
         }
         else if(_loc2_ == "search")
         {
            makerSearch();
         }
         else if(_loc2_ == "prev" || _loc2_ == "next")
         {
            _makerPage = Math.max(0,Math.min(_makerPage + (_loc2_ == "next" ? 1 : -1),Math.ceil(makerList().length / MAKER_ROWS) - 1));
            makerRows();
         }
         else if(_loc2_ == "mine")
         {
            makerMode("mine");
         }
         else if(_loc2_ == "back")
         {
            makerMode("make");
            makerSearch();
         }
         else if(_makerChosen == null)
         {
            makerSay(_makerMode == "make" ? "Choose one of the game's items first." : "Choose one of your items first.");
         }
         else if(_loc2_ == "make")
         {
            if(makerName().length == 0)
            {
               gMainFrame.stage.focus = _makerNameBar.searchTxt;
               makerSay("Type a name for it first.");
               return;
            }
            makerSay("Making it...");
            gMainFrame.server.setXtObject_Str("xcm",["make",_makerChosen.kind,_makerChosen.id,makerName()]);
         }
         else if(_loc2_ == "rename")
         {
            if(makerName().length == 0)
            {
               gMainFrame.stage.focus = _makerNameBar.searchTxt;
               makerSay("Type the new name in the box first.");
               return;
            }
            gMainFrame.server.setXtObject_Str("xcm",["rename",_makerChosen.kind,_makerChosen.id,makerName()]);
         }
         else if(_loc2_ == "delete")
         {
            _loc3_ = _makerChosen;
            new SBYesNoPopup(GuiManager.guiLayer,"Delete " + _loc3_.name + "? It goes from everyone who has it.",true,function(param1:Object):void
            {
               if(param1.status)
               {
                  gMainFrame.server.setXtObject_Str("xcm",["delete",_loc3_.kind,_loc3_.id]);
               }
            },0);
         }
         else if(_loc2_ == "picture")
         {
            makerPickPicture(_makerChosen);
         }
         // how a clothing item with a picture is worn: the picture itself
         // (a sticker) or the item's shape painted with it (a texture)
         else if(_loc2_ == "look")
         {
            if(_makerChosen.kind != "clothing" || !_makerChosen.art)
            {
               makerSay(_makerChosen.kind != "clothing" ? "A den item stands as its picture." : "Give it a picture first.");
               return;
            }
            gMainFrame.server.setXtObject_Str("xcm",["look",_makerChosen.kind,_makerChosen.id,_makerChosen.artMode == "texture" ? "sticker" : "texture"]);
         }
      }

      // the picture: chosen from this computer, read, and sent as it is (the
      // server checks it and takes out what does not belong in it).
      private function makerPickPicture(param1:Object) : void
      {
         _makerUploading = param1;
         _makerFile = new FileReference();
         _makerFile.addEventListener("select",function(param1:Event):void
         {
            makerSay("Reading the picture...");
            _makerFile.load();
         });
         _makerFile.addEventListener("complete",onMakerPictureRead);
         _makerFile.addEventListener("ioError",onMakerFailed);
         try
         {
            _makerFile.browse([new FileFilter("Pictures (PNG, JPEG, GIF, BMP)","*.png;*.jpg;*.jpeg;*.gif;*.bmp")]);
         }
         catch(e:Error)
         {
            makerSay("The picture could not be chosen here. Use your account page on the website instead.");
         }
      }

      // the picture read: sent as it is when the server takes it so (a PNG,
      // JPEG or GIF small enough, or a BMP, which the server makes a PNG); one
      // too big is drawn smaller here and sent as a PNG.
      private static const MAKER_PICTURE_SIDE:int = 512;

      private static const MAKER_PICTURE_BYTES:int = 300 * 1024;

      private function onMakerPictureRead(param1:Event) : void
      {
         var _loc2_:ByteArray = _makerFile.data;
         if(/\.bmp$/i.test(String(_makerFile.name)))
         {
            makerSendPicture(_loc2_);
            return;
         }
         var _loc3_:Loader = new Loader();
         _loc3_.contentLoaderInfo.addEventListener("complete",function(param1:Event):void
         {
            var _loc2_:BitmapData = _loc3_.content is Bitmap ? Bitmap(_loc3_.content).bitmapData : null;
            if(_loc2_ == null)
            {
               makerSay("That picture could not be read. Try a PNG, JPEG or GIF.");
            }
            else if(_loc2_.width <= MAKER_PICTURE_SIDE && _loc2_.height <= MAKER_PICTURE_SIDE && _makerFile.data.length <= MAKER_PICTURE_BYTES)
            {
               makerSendPicture(_makerFile.data);
            }
            else
            {
               makerSay("Making the picture smaller...");
               makerSendPicture(shrunkPng(_loc2_));
            }
         });
         _loc3_.contentLoaderInfo.addEventListener("ioError",function(param1:Event):void
         {
            makerSay("That picture could not be read. Try a PNG, JPEG or GIF.");
         });
         _loc3_.loadBytes(_loc2_);
      }

      // a PNG of the picture fitted in MAKER_PICTURE_SIDE, smaller until it is
      // no more than MAKER_PICTURE_BYTES
      private static function shrunkPng(param1:BitmapData) : ByteArray
      {
         var _loc2_:ByteArray = null;
         for each(var _loc3_:int in [MAKER_PICTURE_SIDE,384,256,128])
         {
            var _loc4_:Number = Math.min(1,_loc3_ / param1.width,_loc3_ / param1.height);
            var _loc5_:BitmapData = new BitmapData(Math.max(1,Math.round(param1.width * _loc4_)),Math.max(1,Math.round(param1.height * _loc4_)),true,0);
            _loc5_.draw(param1,new Matrix(_loc4_,0,0,_loc4_),null,null,null,true);
            _loc2_ = encodePng(_loc5_);
            _loc5_.dispose();
            if(_loc2_.length <= MAKER_PICTURE_BYTES)
            {
               break;
            }
         }
         return _loc2_;
      }

      private static var _crcTable:Array;

      private static function crc32(param1:ByteArray, param2:int, param3:int) : uint
      {
         var _loc4_:uint = 0;
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         if(_crcTable == null)
         {
            _crcTable = [];
            while(_loc5_ < 256)
            {
               _loc4_ = _loc5_;
               _loc6_ = 0;
               while(_loc6_ < 8)
               {
                  _loc4_ = (_loc4_ & 1) != 0 ? uint(0xEDB88320 ^ (_loc4_ >>> 1)) : uint(_loc4_ >>> 1);
                  _loc6_++;
               }
               _crcTable[_loc5_] = _loc4_;
               _loc5_++;
            }
         }
         _loc4_ = 0xFFFFFFFF;
         _loc5_ = param2;
         while(_loc5_ < param3)
         {
            _loc4_ = uint(_crcTable[(_loc4_ ^ param1[_loc5_]) & 0xFF] ^ (_loc4_ >>> 8));
            _loc5_++;
         }
         return uint(_loc4_ ^ 0xFFFFFFFF);
      }

      private static function pngChunk(param1:ByteArray, param2:uint, param3:ByteArray) : void
      {
         param1.writeUnsignedInt(param3 == null ? 0 : param3.length);
         var _loc4_:int = int(param1.position);
         param1.writeUnsignedInt(param2);
         if(param3 != null)
         {
            param1.writeBytes(param3);
         }
         param1.writeUnsignedInt(crc32(param1,_loc4_,int(param1.position)));
      }

      // a PNG (RGBA, 8 bits a channel) of `param1`
      public static function encodePng(param1:BitmapData) : ByteArray
      {
         var _loc2_:ByteArray = new ByteArray();
         var _loc3_:ByteArray = new ByteArray();
         var _loc4_:ByteArray = new ByteArray();
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         var _loc7_:uint = 0;
         _loc2_.writeUnsignedInt(0x89504E47);
         _loc2_.writeUnsignedInt(0x0D0A1A0A);
         _loc3_.writeInt(param1.width);
         _loc3_.writeInt(param1.height);
         _loc3_.writeByte(8);
         _loc3_.writeByte(6);
         _loc3_.writeByte(0);
         _loc3_.writeByte(0);
         _loc3_.writeByte(0);
         pngChunk(_loc2_,0x49484452,_loc3_);
         while(_loc5_ < param1.height)
         {
            _loc4_.writeByte(0);
            _loc6_ = 0;
            while(_loc6_ < param1.width)
            {
               _loc7_ = param1.getPixel32(_loc6_,_loc5_);
               _loc4_.writeUnsignedInt(uint((_loc7_ & 0xFFFFFF) << 8 | _loc7_ >>> 24));
               _loc6_++;
            }
            _loc5_++;
         }
         _loc4_.compress();
         pngChunk(_loc2_,0x49444154,_loc4_);
         pngChunk(_loc2_,0x49454E44,null);
         return _loc2_;
      }

      private function makerSendPicture(param1:ByteArray) : void
      {
         var _loc2_:URLRequest = new URLRequest(gMainFrame.clientInfo.websiteURL + "api/itemart?kind=" + _makerUploading.kind + "&id=" + _makerUploading.id
            + "&token=" + encodeURIComponent(gMainFrame.clientInfo.authToken));
         _loc2_.method = "POST";
         _loc2_.contentType = "application/octet-stream";
         _loc2_.data = param1;
         var _loc3_:URLLoader = new URLLoader();
         _loc3_.addEventListener("complete",function(param1:Event):void
         {
            var _loc2_:Object = null;
            try
            {
               _loc2_ = JSON.parse(param1.target.data);
            }
            catch(e:Error)
            {
               _loc2_ = {"error":"That did not work. Try again."};
            }
            makerSay(_loc2_.ok ? String(_loc2_.ok) : String(_loc2_.error));
            gMainFrame.server.setXtObject_Str("xcm",["info"]);
         });
         _loc3_.addEventListener("ioError",onMakerFailed);
         _loc3_.addEventListener("securityError",onMakerFailed);
         makerSay("Sending the picture...");
         _loc3_.load(_loc2_);
      }

      private function onFinderKey(param1:KeyboardEvent) : void
      {
         if(param1.eventPhase == 3)
         {
            return;
         }
         var _loc2_:Boolean = _finder != null && _finder.visible;
         // the Item Maker and the staff's window: Esc closes them, Enter
         // searches (in the Item Maker's search box), and no key gets past
         // them to the game (which would take typing for its chat bar).
         if(_maker != null && _maker.visible)
         {
            if(param1.keyCode == 27)
            {
               showItemMaker(false);
            }
            else if(param1.keyCode == 13 && gMainFrame.stage.focus == _makerSearchBar.searchTxt)
            {
               makerSearch();
            }
            param1.stopImmediatePropagation();
            return;
         }
         if(_moderate != null && _moderate.visible)
         {
            if(param1.keyCode == 27)
            {
               hideModerate();
            }
            param1.stopImmediatePropagation();
            return;
         }
         if(_theatreControl != null && _theatreControl.visible)
         {
            if(param1.keyCode == 27)
            {
               _theatreControl.visible = false;
               gMainFrame.stage.focus = null;
            }
            param1.stopImmediatePropagation();
            return;
         }
         if(_roomControl != null && _roomControl.visible)
         {
            if(param1.keyCode == 27)
            {
               _roomControl.visible = false;
            }
            param1.stopImmediatePropagation();
            return;
         }
         // the rules: Esc closes them as their X does
         if(_rulesWin != null && _rulesWin.visible)
         {
            if(param1.keyCode == 27)
            {
               onRulesCloseClick(new MouseEvent("mouseDown"));
            }
            param1.stopImmediatePropagation();
            return;
         }
         // the chat filter's window: Esc leaves it as its X does, Enter
         // saves, and no key gets past it to the game.
         if(_filterWin != null && _filterWin.visible)
         {
            if(param1.keyCode == 27)
            {
               onFilterCloseClick(new MouseEvent("mouseDown"));
            }
            else if(param1.keyCode == 13)
            {
               saveChatFilter();
            }
            param1.stopImmediatePropagation();
            return;
         }
         if(param1.keyCode == 120)
         {
            openTool(0);
            if(_loc2_)
            {
               showItemFinder(false);
            }
            param1.stopImmediatePropagation();
            return;
         }
         if(_loc2_)
         {
            if(param1.keyCode == 27)
            {
               showItemFinder(false);
            }
            else if(param1.keyCode == 13)
            {
               finderSearch();
            }
            param1.stopImmediatePropagation();
         }
      }
      
      private function onFinderKindClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         _finderKind = (_finderKind + 1) % 3;
         finderButtonText(_finderKindButton,_finderKind == 0 ? "All items" : (_finderKind == 1 ? "Clothing" : "Den items"));
         finderSearch();
      }
      
      private function finderSearch() : void
      {
         if(gMainFrame.stage.focus != _finderColourInput)
         {
            gMainFrame.stage.focus = _finderInput;
         }
         if(_finderInput.text.length == 0)
         {
            _finderStatus.text = "Type a name or an id, then press Enter.";
            return;
         }
         var _loc1_:String = _finderKind == 0 ? "all" : (_finderKind == 1 ? "clothing" : "den");
         var _loc2_:URLLoader = new URLLoader();
         _loc2_.addEventListener("complete",onFinderSearchDone);
         _loc2_.addEventListener("ioError",onFinderFailed);
         _loc2_.addEventListener("securityError",onFinderFailed);
         _finderStatus.text = "Searching...";
         _loc2_.load(new URLRequest(gMainFrame.clientInfo.websiteURL + "api/search?kind=" + _loc1_ + "&q=" + encodeURIComponent(_finderInput.text) + "&username=" + encodeURIComponent(gMainFrame.server.userName) + "&token=" + encodeURIComponent(gMainFrame.clientInfo.authToken)));
      }
      
      private function onFinderFailed(param1:Event) : void
      {
         _finderStatus.text = "The server did not accept that.";
      }
      
      private function onFinderSearchDone(param1:Event) : void
      {
         var _loc2_:Object = JSON.parse(String(URLLoader(param1.target).data));
         _finderResults = _loc2_.results as Array;
         _finderTotal = int(_loc2_.total);
         _finderPage = 0;
         for each(var _loc3_:Object in _finderResults)
         {
            _loc3_.colorIndex = 0;
         }
         if(_finderTotal == 0)
         {
            _finderStatus.text = "Nothing matches.";
         }
         else if(_finderTotal > _finderResults.length)
         {
            _finderStatus.text = "Showing the first " + _finderResults.length + " of " + _finderTotal + " matches.";
         }
         else
         {
            _finderStatus.text = _finderTotal + (_finderTotal == 1 ? " match." : " matches.") + " Click a row to change its colour.";
         }
         renderFinderRows();
      }
      
      private function finderRowText(param1:Object) : String
      {
         var _loc2_:String = param1.id + "   " + param1.name + "   (" + (param1.kind == "den" ? "den item" : "clothing");
         if(int(param1.colors) > 1)
         {
            _loc2_ += ", colour " + (int(param1.colorIndex) + 1) + "/" + param1.colors;
         }
         return _loc2_ + ")";
      }
      
      private function renderFinderRows() : void
      {
         var _loc1_:Object = null;
         var _loc2_:int = 0;
         var _loc3_:MovieClip = null;
         var _loc4_:MovieClip = null;
         while(_finderRows.numChildren > 0)
         {
            _finderRows.removeChildAt(0);
         }
         for each(var _loc6_:Object in _finderIcons)
         {
            try
            {
               _loc6_.destroy();
            }
            catch(e:Error)
            {
            }
         }
         _finderIcons = {};
         var _loc5_:int = Math.max(1,Math.ceil(_finderResults.length / 6));
         _loc2_ = _finderPage * 6;
         while(_loc2_ < _finderResults.length && _loc2_ < _finderPage * 6 + 6)
         {
            _loc1_ = _finderResults[_loc2_];
            _loc3_ = GETDEFINITIONBYNAME("textBtnCont");
            _loc3_.x = -74;
            _loc3_.y = (_loc2_ - _finderPage * 6) * 40;
            _loc3_.name = "row" + _loc2_;
            _loc3_.currTxt.mouseEnabled = false;
            _loc3_.currTxt.text = finderRowText(_loc1_);
            _loc3_.addEventListener("mouseDown",onFinderColourClick);
            _finderRows.addChild(_loc3_);
            _loc4_ = GETDEFINITIONBYNAME("buyBtnCont");
            _loc4_.scaleX = 0.8;
            _loc4_.scaleY = 0.8;
            _loc4_.x = 152;
            _loc4_.y = _loc3_.y;
            _loc4_.name = "give" + _loc2_;
            finderButtonText(_loc4_,"Give");
            _loc4_.addEventListener("mouseDown",onFinderGiveClick);
            _finderRows.addChild(_loc4_);
            _finderRows.addChild(finderPreview(_loc1_,_loc2_,226,_loc3_.y));
            _loc2_++;
         }
         _finderPageLabel.text = _finderResults.length == 0 ? "" : "Page " + (_finderPage + 1) + " of " + _loc5_;
      }
      
      private function onFinderPrevClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_finderPage > 0)
         {
            _finderPage--;
            renderFinderRows();
         }
      }
      
      private function onFinderNextClick(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if((_finderPage + 1) * 6 < _finderResults.length)
         {
            _finderPage++;
            renderFinderRows();
         }
      }
      
      private function onFinderColourClick(param1:MouseEvent) : void
      {
         var _loc2_:MovieClip = MovieClip(param1.currentTarget);
         var _loc3_:Object = _finderResults[int(_loc2_.name.substr(3))];
         param1.stopPropagation();
         if(_loc3_ != null && int(_loc3_.colors) > 1)
         {
            _loc3_.colorIndex = (int(_loc3_.colorIndex) + 1) % int(_loc3_.colors);
            _loc2_.currTxt.text = finderRowText(_loc3_);
            recolourFinderPreview(int(_loc2_.name.substr(3)));
         }
      }
      
      private function onFinderGiveClick(param1:MouseEvent) : void
      {
         var _loc2_:Object = _finderResults[int(MovieClip(param1.currentTarget).name.substr(4))];
         var _loc3_:URLRequest = new URLRequest(gMainFrame.clientInfo.websiteURL + "api/give");
         param1.stopPropagation();
         _loc3_.method = "POST";
         _loc3_.contentType = "application/json";
         var _loc5_:Object = {
            "username":gMainFrame.server.userName,
            "token":gMainFrame.clientInfo.authToken,
            "kind":_loc2_.kind,
            "id":_loc2_.id,
            "colorIndex":_loc2_.colorIndex
         };
         if(_finderColourInput.text.length > 0 && _loc2_.kind != "den")
         {
            if(_finderColourInput.text.indexOf("#") >= 0 ? finderHexColours(_finderColourInput.text) == null : !/^\s*-?[0-9]+\s*$/.test(_finderColourInput.text))
            {
               _finderStatus.text = "Colour: an id, or #RRGGBB";
               return;
            }
            _loc5_.color = _finderColourInput.text;
         }
         _loc3_.data = JSON.stringify(_loc5_);
         var _loc4_:URLLoader = new URLLoader();
         _loc4_.addEventListener("complete",onFinderGiveDone);
         _loc4_.addEventListener("ioError",onFinderFailed);
         _loc4_.addEventListener("securityError",onFinderFailed);
         _finderStatus.text = "Adding " + _loc2_.name + "...";
         _loc4_.load(_loc3_);
      }
      
      // one to four "#RRGGBB" (spaces or commas between) as the four colour
      // bands' RGB values, the last filling the rest; null if it is not that.
      // the server reads the box the same way (lib/admin.js).
      private static function finderHexColours(param1:String) : Array
      {
         var _loc2_:String = param1.replace(/^\s+|\s+$/g,"");
         var _loc3_:Array = null;
         var _loc4_:Array = [];
         var _loc5_:int = 0;
         if(!/^#[0-9a-f]{6}([\s,]+#[0-9a-f]{6}){0,3}$/i.test(_loc2_))
         {
            return null;
         }
         _loc3_ = _loc2_.split(/[\s,]+/);
         while(_loc5_ < 4)
         {
            _loc4_.push(uint(parseInt(String(_loc3_[Math.min(_loc5_,_loc3_.length - 1)]).substr(1),16)));
            _loc5_++;
         }
         return _loc4_;
      }
      
      // the colour a clothing row is drawn in: the box's colour id or hex
      // colour, else the item's own colour that the row is on
      private function finderPreviewColour(param1:Object) : uint
      {
         var _loc2_:String = _finderColourInput == null ? "" : _finderColourInput.text.replace(/^\s+|\s+$/g,"");
         var _loc3_:Array = null;
         var _loc4_:Object = null;
         if(_loc2_.length > 0 && _loc2_.indexOf("#") >= 0)
         {
            _loc3_ = finderHexColours(_loc2_);
            if(_loc3_ != null)
            {
               if(_loc3_.join(",") != _finderHexKey)
               {
                  // a new id each time, so no drawing keeps the old palette;
                  // 0xFDFFFF00 and up is far past what the server hands out
                  _finderHexKey = _loc3_.join(",");
                  _finderHexId = uint(0xFDFFFF00 + (_finderHexCount++ & 0xFF));
                  PaletteHelper.customColors[_finderHexId] = _loc3_;
               }
               return _finderHexId;
            }
         }
         else if(/^-?[0-9]+$/.test(_loc2_))
         {
            // a negative id is the same colour written signed
            return uint(Number(_loc2_));
         }
         _loc4_ = ItemXtCommManager.getItemDef(int(param1.id));
         if(_loc4_ == null || _loc4_.colors == null || _loc4_.colors.length == 0)
         {
            return 0;
         }
         return uint(_loc4_.colors[Math.min(int(param1.colorIndex),_loc4_.colors.length - 1)]);
      }
      
      // the row's item as the game draws it in a shop, in a box at the row's end
      private function finderPreview(param1:Object, param2:int, param3:Number, param4:Number) : Sprite
      {
         var _loc5_:Sprite = new Sprite();
         var _loc6_:Sprite = new Sprite();
         var _loc7_:Matrix = new Matrix();
         var _loc8_:* = null;
         var _loc9_:Sprite = null;
         _loc5_.x = param3;
         _loc5_.y = param4;
         _loc5_.mouseEnabled = false;
         _loc5_.mouseChildren = false;
         _loc5_.graphics.beginFill(7160624);
         _loc5_.graphics.drawRoundRect(-19,-19,38,38,14,14);
         _loc5_.graphics.endFill();
         _loc5_.graphics.beginFill(10115109);
         _loc5_.graphics.drawRoundRect(-18,-18,36,36,12,12);
         _loc5_.graphics.endFill();
         _loc7_.createGradientBox(32,32,Math.PI / 2,-16,-16);
         _loc5_.graphics.beginGradientFill("linear",[11459790,15261660,16250099],[1,1,1],[0,127,255],_loc7_);
         _loc5_.graphics.drawRoundRect(-16,-16,32,32,10,10);
         _loc5_.graphics.endFill();
         _loc5_.addChild(_loc6_);
         try
         {
            if(param1.kind == "den")
            {
               if(DenXtCommManager.getDenItemDef(int(param1.id)) == null)
               {
                  return _loc5_;
               }
               _loc8_ = new DenItem();
               DenItem(_loc8_).initShopItem(int(param1.id),0);
            }
            else
            {
               if(ItemXtCommManager.getItemDef(int(param1.id)) == null)
               {
                  return _loc5_;
               }
               _loc8_ = new Item();
               Item(_loc8_).init(int(param1.id),0,finderPreviewColour(param1),null,true);
            }
            // fitted to the box once drawn, which may be before the icon is
            // handed back when its picture was loaded already
            _loc8_.imageLoadedCallback = function():void
            {
               var _loc1_:Number = 0;
               if(_loc6_.numChildren > 0)
               {
                  _loc6_.scaleX = _loc6_.scaleY = 1;
                  _loc1_ = Math.max(_loc6_.width,_loc6_.height);
                  if(_loc1_ > 0)
                  {
                     _loc6_.scaleX = _loc6_.scaleY = Math.min(1,30 / _loc1_);
                  }
               }
            };
            _loc9_ = _loc8_.icon;
            if(_loc9_ != null)
            {
               _loc6_.addChild(_loc9_);
               if(_loc8_.isIconLoaded)
               {
                  _loc8_.imageLoadedCallback();
               }
            }
            _finderIcons[param2] = _loc8_;
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("item giver preview " + param1.kind + " " + param1.id + ": " + e);
         }
         return _loc5_;
      }
      
      private function recolourFinderPreview(param1:int) : void
      {
         var _loc2_:Item = _finderIcons[param1] as Item;
         if(_loc2_ != null && _finderResults[param1] != null)
         {
            _loc2_.color = finderPreviewColour(_finderResults[param1]);
            _loc2_.icon;
         }
      }
      
      // the previews follow the colour box once what is in it reads as a
      // colour, or is emptied
      private function onFinderColourTyped(param1:Event) : void
      {
         var _loc2_:String = _finderColourInput.text.replace(/^\s+|\s+$/g,"");
         if(_loc2_.length == 0 || /^-?[0-9]+$/.test(_loc2_) || finderHexColours(_loc2_) != null)
         {
            for(var _loc3_:String in _finderIcons)
            {
               recolourFinderPreview(int(_loc3_));
            }
         }
      }
      
      private function onFinderGiveDone(param1:Event) : void
      {
         _finderStatus.text = "Added to your inventory.";
      }
      
      private function onInitiationFailure() : void
      {
         new SBStandardPopup(gMainFrame.stage,LocalizationManager.translateIdOnly(11202),false);
      }
      
      private function createAvatar() : void
      {
      }
      
      private function shardSelection() : void
      {
      }
      
      private function enterGame() : void
      {
      }
      
      private function handleGlobalErrors(param1:UncaughtErrorEvent) : void
      {
         GlobalErrorCatch.globalErrorListener(param1);
      }
   }
}

