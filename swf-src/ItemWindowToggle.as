package gui.itemWindows
{
   import achievement.AchievementXtCommManager;
   import com.sbi.corelib.audio.SBAudio;
   import com.sbi.debug.DebugUtility;
   import den.DenXtCommManager;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.DisplayObject;
   import flash.display.GradientType;
   import flash.display.SpreadMethod;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.geom.Matrix;
   import flash.events.MouseEvent;
   import flash.events.Event;
   import flash.external.ExternalInterface;
   import flash.geom.Rectangle;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   import flash.text.TextField;
   import flash.text.TextFieldType;
   import flash.text.TextFormat;
   import flash.utils.getTimer;
   import gamePlayFlow.GamePlay;
   import gui.CursorManager;
   import gui.GuiHud;
   import gui.GuiManager;
   import gui.MySettings;
   import gui.ServerSelector;
   import localization.LocalizationManager;
   import room.RoomManagerWorld;
   
   public class ItemWindowToggle extends ItemWindowBase
   {

      private static const SLIDER_RECT:Rectangle = new Rectangle(15,15.5,82,0);
      
      // A lightweight editor made from native Flash display objects. Keeping it
      // here lets the existing Settings button open it without a browser bridge.
      private static const CHAT_COLOUR_KEYS:Array = ["background","accent","text","border"];
      private static const CHAT_ANIMATIONS:Array = ["none","pulse","shimmer","flow","rainbow"];
      private static const CHAT_GRADIENTS:Array = ["linear","radial","solid"];
      private static const CHAT_ANGLES:Array = [0,45,90,135,180,225,270,315];
      private static const CHAT_STRENGTHS:Array = [0,25,50,75,100];
      private static const CHAT_OUTLINES:Array = [0,1,2,3,4];
      private static const CHAT_OPACITIES:Array = [25,40,55,70,85,100];
      private static const CHAT_SPEEDS:Array = [40,70,100,150,200,300];
      private static const CHAT_PALETTE:Array = [
         "ffffff","f3ead1","ffd6d6","ffe0b2","fff3b0","dff2bd","bcebcf","b9efff",
         "cbd5ff","e1d0ff","ffd6f3","d6d6d6","9aabb0","ff5a68","ff8a3d","ffd23f",
         "54a96b","26c6da","41a9df","5b7cfa","734fd1","ef5da8","8f5a3c","445559",
         "1f2937","5b203e","214d31","16435b","18264b","342018","000000","ff0069"
      ];
      private static const CHAT_PRESETS:Array = [
         {"name":"Ocean","background":"d9fbff","accent":"41a9df","text":"16435b","border":"237ba9","opacity":85,"gradient":"linear","angle":45,"strength":100,"animation":"shimmer","speed":100,"outline":1},
         {"name":"Sunset","background":"ffcf70","accent":"ef5da8","text":"5b203e","border":"d74277","opacity":85,"gradient":"linear","angle":135,"strength":100,"animation":"flow","speed":100,"outline":1},
         {"name":"Forest","background":"dff2bd","accent":"54a96b","text":"214d31","border":"387747","opacity":85,"gradient":"radial","angle":45,"strength":75,"animation":"pulse","speed":70,"outline":1},
         {"name":"Midnight","background":"18264b","accent":"734fd1","text":"ffffff","border":"9c83ef","opacity":85,"gradient":"radial","angle":45,"strength":100,"animation":"shimmer","speed":100,"outline":2},
         {"name":"Candy","background":"ffe1f1","accent":"9ce7ff","text":"8f1f63","border":"ef6bb2","opacity":85,"gradient":"linear","angle":90,"strength":100,"animation":"flow","speed":150,"outline":1},
         {"name":"Rainbow","background":"ff5a68","accent":"7b67ff","text":"ffffff","border":"ff3d94","opacity":85,"gradient":"linear","angle":0,"strength":100,"animation":"rainbow","speed":100,"outline":1}
      ];
      private static var _chatStyle:Object = {"background":"ffffff","accent":"dfe8ff","text":"445559","border":"9aabb0","opacity":75,"animation":"none","speed":100,"gradient":"linear","angle":45,"strength":100,"outline":1,"stops":"ffffff:0;dfe8ff:100"};
      private static var _chatPopup:Sprite;
      private static var _chatFields:Array;
      private static var _chatButtons:Object;
      private static var _chatStatus:TextField;
      private static var _chatPreview:Sprite;
      private static var _chatSwatches:Array;
      private static var _chatPanel:Sprite;
      private static var _chatPalette:Sprite;
      private static var _chatColourIndex:int = -1;
      private static var _chatStops:Array = [{"color":"ffffff","position":0},{"color":"dfe8ff","position":100}];
      private static var _chatSelectedStop:int = 0;
      private static var _chatStopSprites:Array;
      private static var _chatTrack:Sprite;
      private static var _chatPreset:int = -1;

      private var _lock:MovieClip;
      
      private var _currHeight:int;
      
      private var _mySettingsCloseFunction:Function;
      
      private var _mySettingsThemesFunction:Function;
      
      private var _musicToggle:ItemWindowToggle;
      
      public function ItemWindowToggle(param1:Function, param2:Object, param3:String, param4:int, param5:Function = null, param6:Function = null, param7:Function = null, param8:Function = null, param9:Object = null)
      {
         _mySettingsCloseFunction = param9.onClose;
         _mySettingsThemesFunction = param9.onThemes;
         super("mySettingsToggle|false",param1,param2,param3,param4,param5,param6,param7,param8);
      }
      
      public function get currFrameLabel() : String
      {
         return _currItem.frame;
      }
      
      public function resetConditions() : void
      {
         setChildrenAndInitialConditions();
      }
      
      override protected function onWindowLoadCallback() : void
      {
         super.onWindowLoadCallback();
         addEventListeners();
      }
      
      override public function loadCurrItem(param1:int = 0, param2:int = 0) : void
      {
      }
      
      override public function get height() : Number
      {
         return _currHeight;
      }
      
      override protected function setChildrenAndInitialConditions() : void
      {
         var _loc1_:Boolean = false;
         _currHeight = _window.height;
         _window.goNowBtn.visible = false;
         _window.woodenCursorBtn.visible = false;
         _window.defaultCursorBtn.visible = false;
         _window.toggleBtn.visible = false;
         _window.toggleTxt.visible = false;
         _window.scrubBtn.visible = false;
         switch(_currItem.type)
         {
            case MySettings.TOGGLE_TYPE_TOGGLE_BTN:
               _window.toggleBtn.visible = true;
               _window.toggleBtn.toggleBtn.toggleKnob.gotoAndStop("up");
               _window.toggleBtn.toggleBtn.toggleBG.gotoAndStop("up");
               _window.icon.gotoAndStop(_currItem.iconFrame != null ? _currItem.iconFrame : _currItem.frame);
               _window.toggleBtn.addEventListener("mouseDown",handleMouseDown,false,0,true);
               _window.toggleBtn.addEventListener("rollOver",handleMouseOver,false,0,true);
               _window.toggleBtn.addEventListener("rollOut",handleMouseOut,false,0,true);
               break;
            case MySettings.TOGGLE_TYPE_TEXT:
               _window.toggleTxt.visible = true;
               _window.icon.gotoAndStop(_currItem.frame);
               break;
            case MySettings.TOGGLE_TYPE_CURSOR:
               _window.woodenCursorBtn.visible = true;
               _window.defaultCursorBtn.visible = true;
               _window.icon.visible = false;
               if(GuiManager.sharedObj && (GuiManager.sharedObj.data.cursor == "custom" || GuiManager.sharedObj.data.cursor == null))
               {
                  _window.woodenCursorBtn.upToDownState();
                  _window.woodenCursorBtn.mouseEnabled = false;
                  _window.woodenCursorBtn.mouseChildren = false;
               }
               else
               {
                  _window.defaultCursorBtn.upToDownState();
                  _window.defaultCursorBtn.mouseEnabled = false;
                  _window.defaultCursorBtn.mouseChildren = false;
               }
               _window.woodenCursorBtn.addEventListener("mouseDown",handleMouseDown,false,0,true);
               _window.defaultCursorBtn.addEventListener("mouseDown",handleMouseDown,false,0,true);
               break;
            case MySettings.TOGGLE_TYPE_JOIN:
               _window.goNowBtn.visible = true;
               _window.goNowBtn.addEventListener("mouseDown",handleMouseDown,false,0,true);
               if(_currItem.iconFrame == "house")
               {
                  _window.icon.gotoAndStop("denPlayerIcon");
                  showHouseIcon();
               }
               else
               {
                  _window.icon.gotoAndStop(_currItem.iconFrame != null ? _currItem.iconFrame : _currItem.frame);
               }
               break;
            case MySettings.TOGGLE_TYPE_SCRUB:
               _window.scrubBtn.visible = true;
               _window.icon.gotoAndStop("music");
               _window.icon.music.gotoAndStop("startingOn");
               _window.scrubBtn.addEventListener("mouseDown",handleMouseDown,false,0,true);
               _window.addEventListener("mouseUp",handleMouseUp,false,0,true);
               _window.addEventListener("mouseMove",handleMouseMove,false,0,true);
               _window.addEventListener("rollOut",handleMouseOut,false,0,true);
               _window.scrubBtn.scrubKnob.gotoAndStop("up");
               _window.scrubBtn.scrubBG.gotoAndStop("up");
               _window.scrubBtn.addEventListener("rollOver",handleMouseOver,false,0,true);
               _window.scrubBtn.addEventListener("rollOut",handleMouseOut,false,0,true);
               if(_currItem.sound)
               {
                  // music or sound effects (AJClient's sound settings)
                  _window.scrubBtn.scrubKnob.x = AJClient.soundVolume(_currItem.sound) * 82 + 15;
                  _window.labelTxtCont.labelTxt.text = _currItem.labelLabel;
               }
               else if(GuiManager.sharedObj && GuiManager.sharedObj.data.volume != null)
               {
                  _window.scrubBtn.scrubKnob.x = GuiManager.sharedObj.data.volume * 82 + 15;
               }
         }
         switch(_currItem.frame)
         {
            case "lock":
               if(gMainFrame.userInfo.denPrivacySettings != 2)
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "world":
               _window.goNowBtn.down.txt.text = ServerSelector.getShardName(RoomManagerWorld.instance.shardId);
               _window.goNowBtn.mouse.mouse.txt.text = ServerSelector.getShardName(RoomManagerWorld.instance.shardId);
               _window.goNowBtn.mouse.up.txt.text = ServerSelector.getShardName(RoomManagerWorld.instance.shardId);
               break;
            case "itemFinder":
            case "itemMaker":
            case "chatFilter":
            case "chatBubble":
            case "themeMenu":
            case "themePick":
            case "savedMenu":
            case "commandPick":
               _window.goNowBtn.down.txt.text = _currItem.btnLabel;
               _window.goNowBtn.mouse.mouse.txt.text = _currItem.btnLabel;
               _window.goNowBtn.mouse.up.txt.text = _currItem.btnLabel;
               _window.labelTxtCont.labelTxt.text = _currItem.labelLabel;
               if(_currItem.frame == "chatBubble")
               {
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               break;
            case "hideBlocked":
            case "customArt":
            case "wasd":
               _window.toggleBtn.gotoAndStop("double");
               _window.toggleBtn.toggleBtn.gotoAndStop(ownSwitchOn() ? "startingOn" : "startingOff");
               setToggleLabels();
               _window.labelTxtCont.labelTxt.text = _currItem.labelLabel;
               break;
            case "expandedInventory":
               showExpandedInventory();
               break;
            case "performance":
               showPerformance();
               break;
            case "graphics":
               showGraphics();
               break;
            case "frameRate":
               showFrameRate();
               break;
            case "camera":
               showCamera();
               break;
            case "redeemCode":
            case "verifyEmail":
            case "twoFactor":
               LocalizationManager.translateId(_window.goNowBtn.down.txt,_currItem.btnTxt);
               LocalizationManager.translateId(_window.goNowBtn.mouse.mouse.txt,_currItem.btnTxt);
               LocalizationManager.translateId(_window.goNowBtn.mouse.up.txt,_currItem.btnTxt);
               break;
            case "music":
               if(SBAudio.isMusicMuted || SBAudio.areSoundsMuted)
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "buddyRequest":
               if(Utility.isSettingOn(MySettings.SETTINGS_BUDDY_REQUESTS))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "gameInvites":
               if(Utility.isSettingOn(MySettings.SETTINGS_GAME_INVITES))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "doorBell":
               if(Utility.isSettingOn(MySettings.SETTINGS_DOOR_BELL))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "autoServer":
               if(Utility.isSettingOn(MySettings.SETTINGS_AUTO_SERVER_TRAVEL))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "nameBadge":
               if(Utility.isSettingOn(MySettings.SETTINGS_USERNAME_BADGE))
               {
                  _window.toggleBtn.gotoAndStop("double");
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
               }
               else
               {
                  _window.toggleBtn.gotoAndStop("double");
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "denPlayerIcon":
               if(Utility.isSettingOn(MySettings.SETTINGS_DEN_PLAYER_ICON))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "jammerWallIcon":
               if(Utility.isSettingOn(MySettings.SETTINGS_JAMMER_WALL_ICON))
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "predictTxt":
               _loc1_ = Utility.isSettingOn(MySettings.SETTINGS_CHAT_PREDICTION);
               if(gMainFrame.userInfo.sgChatType == 1)
               {
                  if(!Utility.hasChatSettingBeenSet())
                  {
                     _loc1_ = false;
                  }
               }
               if(_loc1_)
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOn");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOn");
               }
               else
               {
                  _window.toggleBtn.toggleBtn.gotoAndStop("startingOff");
                  _window.icon["" + _window.icon.currentFrameLabel].gotoAndStop("startingOff");
               }
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
               LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
               break;
            case "intro":
         }
         if(_currItem.labelTxt)
         {
            LocalizationManager.translateId(_window.labelTxtCont.labelTxt,_currItem.labelTxt);
         }
      }
      
      // the settings artwork has no house among its icons, so the rows for
      // den layouts borrow the picture of the den button on the game's bar.
      // if that cannot be drawn, the row keeps the icon it has.
      private function showHouseIcon() : void
      {
         var _loc1_:DisplayObject = null;
         var _loc2_:Rectangle = null;
         var _loc3_:Rectangle = null;
         var _loc4_:BitmapData = null;
         var _loc5_:Bitmap = null;
         var _loc6_:Number = NaN;
         try
         {
            _loc1_ = GuiManager.mainHud.denBtn;
            _loc2_ = _loc1_.getBounds(_loc1_);
            _loc3_ = _window.icon.getBounds(_window);
            if(_loc2_.width < 1 || _loc2_.height < 1 || _loc3_.width < 1)
            {
               return;
            }
            _loc4_ = new BitmapData(Math.ceil(_loc2_.width * 2),Math.ceil(_loc2_.height * 2),true,0);
            _loc4_.draw(_loc1_,new Matrix(2,0,0,2,-_loc2_.x * 2,-_loc2_.y * 2),null,null,null,true);
            _loc5_ = new Bitmap(_loc4_,"auto",true);
            _loc6_ = Math.min(_loc3_.width / _loc4_.width,_loc3_.height / _loc4_.height);
            _loc5_.scaleX = _loc5_.scaleY = _loc6_;
            _loc5_.x = _loc3_.x + (_loc3_.width - _loc4_.width * _loc6_) * 0.5;
            _loc5_.y = _loc3_.y + (_loc3_.height - _loc4_.height * _loc6_) * 0.5;
            _window.addChildAt(_loc5_,_window.getChildIndex(_window.icon) + 1);
            _window.icon.visible = false;
         }
         catch(e:Error)
         {
         }
      }
      
      // the switches of this server's own (MySettings): on is the left
      // choice, as on the Nametag row. "WASD Movement": walking with those
      // four keys as well as the arrow keys (room.RoomManagerView), user var
      // 9002. "Blocked Players": shown, or hidden in rooms, user var 9001.
      // "Custom Items": the pictures players give their items, or every item
      // with its base's art (AJClient.customArtOn), user var 9006.
      private function ownSwitchOn() : Boolean
      {
         switch(_currItem.frame)
         {
            case "wasd":
               return AJClient.wasdOn();
            case "hideBlocked":
               return !blockedAreHidden();
            case "customArt":
               return AJClient.customArtOn();
         }
         return false;
      }

      private function setOwnSwitch(param1:Boolean) : void
      {
         switch(_currItem.frame)
         {
            case "wasd":
               setWasd(param1);
               break;
            case "hideBlocked":
               setHideBlocked(!param1);
               break;
            case "customArt":
               setCustomArt(param1);
         }
      }

      // the two choices either side of a switch: the game's strings, or
      // words of this server's
      private function setToggleLabels() : void
      {
         if(_currItem.onLabel != null)
         {
            _window.toggleBtn.toggleBtn.valueTxt.onTxt.text = _currItem.onLabel;
            _window.toggleBtn.toggleBtn.valueTxt.offTxt.text = _currItem.offLabel;
         }
         else
         {
            LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
            LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
         }
      }

      // the three rows of smooth graphics (AJClient has what each does): a
      // name on the left and on the button what it is set to now; a press
      // goes on to the next choice. user vars 9003 to 9005.
      private function showChoice(param1:String, param2:String) : void
      {
         _window.goNowBtn.down.txt.text = param2;
         _window.goNowBtn.mouse.mouse.txt.text = param2;
         _window.goNowBtn.mouse.up.txt.text = param2;
         _window.labelTxtCont.labelTxt.text = param1;
      }
      
      private function setChoice(param1:int, param2:int) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(param1,param2);
         AchievementXtCommManager.requestSetUserVar(param1,param2);
      }
      
      private function showGraphics() : void
      {
         showChoice("Graphics",AJClient.smoothOn() ? "Smooth" : "Default");
      }

      private function showPerformance() : void
      {
         showChoice("Performance",AJClient.performanceProfileLabel());
      }

      // High, Balanced, Low-end, and round again (AJClient.performanceProfile
      // has how each is kept)
      private function nextPerformance() : void
      {
         var _loc1_:int = AJClient.performanceProfile();
         setChoice(9007,_loc1_ == 2 ? 3 : (_loc1_ == 0 ? 1 : 2));
         showPerformance();
      }
      
      private function showFrameRate() : void
      {
         showChoice("Frame rate",AJClient.frameRate() > 0 ? String(AJClient.frameRate()) : "Max");
      }
      
      // 60 or Max, turn about.
      private function nextFrameRate() : void
      {
         setChoice(9004,AJClient.frameRate() > 0 ? 2 : 1);
         showFrameRate();
      }
      
      private function showCamera() : void
      {
         showChoice("Camera",AJClient.cameraEases() ? "Smooth" : "Normal");
      }
      
      private function setWasd(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9002,param1 ? 1 : 0);
         AchievementXtCommManager.requestSetUserVar(9002,param1 ? 1 : 0);
         if(param1)
         {
            gMainFrame.stage.focus = null;
         }
      }
      
      private function blockedAreHidden() : Boolean
      {
         return gMainFrame.userInfo.userVarCache.getUserVarValueById(9001) == 1;
      }
      
      private function setHideBlocked(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9001,param1 ? 1 : 0);
         AchievementXtCommManager.requestSetUserVar(9001,param1 ? 1 : 0);
      }
      
      private function setCustomArt(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9006,param1 ? 0 : 1);
         AchievementXtCommManager.requestSetUserVar(9006,param1 ? 0 : 1);
      }

      // "Expanded Inventory" (Strawberry Jam's): more, smaller items a row in
      // the clothes and item pickers, how many by the + and - at the avatar
      // editor's item counter (AJClient.inventoryColumns). user var 9009.
      private function showExpandedInventory() : void
      {
         var _loc1_:String = AJClient.expandedInventoryOn() ? "Turn off" : "Turn on";
         _window.goNowBtn.down.txt.text = _loc1_;
         _window.goNowBtn.mouse.mouse.txt.text = _loc1_;
         _window.goNowBtn.mouse.up.txt.text = _loc1_;
         _window.labelTxtCont.labelTxt.text = "Expanded Inventory";
      }

      private function setExpandedInventory(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9009,param1 ? 1 : 0);
         AchievementXtCommManager.requestSetUserVar(9009,param1 ? 1 : 0);
         if(GuiManager.avatarEditor)
         {
            GuiManager.avatarEditor.refreshInventoryLayout();
         }
         showExpandedInventory();
      }

      // `xcs` is the account's saved chat style: [background, accent, text,
      // border, opacity, animation, speed, gradient, angle, strength, outline,
      // stops]. The server sends it when this
      // popup opens and whenever it saves, so its state remains authoritative.
      public static function chatStyleState(param1:Object) : void
      {
         if(param1 == null || param1.length < 9)
         {
            return;
         }
         _chatStyle = {
            "background":String(param1[2]).toLowerCase(),
            "accent":String(param1[3]).toLowerCase(),
            "text":String(param1[4]).toLowerCase(),
            "border":String(param1[5]).toLowerCase(),
            "opacity":int(param1[6]),
            "animation":String(param1[7]),
            "speed":int(param1[8]),
            "gradient":param1.length > 9 ? String(param1[9]) : "linear",
            "angle":param1.length > 10 ? int(param1[10]) : 45,
            "strength":param1.length > 11 ? int(param1[11]) : 100,
            "outline":param1.length > 12 ? int(param1[12]) : 1,
            "stops":param1.length > 13 ? String(param1[13]) : String(param1[2]) + ":0;" + String(param1[3]) + ":100"
         };
         _chatStops = parseChatStops(_chatStyle.stops);
         _chatSelectedStop = 0;
         _chatPreset = findChatPreset();
         if(_chatPopup != null)
         {
            refreshChatPopup();
            _chatStatus.text = "Saved. Send a chat message to see it in the room.";
         }
      }

      private static function showChatBubbleEditor() : void
      {
         var _loc1_:Sprite = null;
         var _loc2_:Sprite = null;
         var _loc3_:TextField = null;
         var _loc4_:int = 0;
         var _loc5_:String = null;
         var _loc6_:Number = NaN;
         var _loc7_:Number = NaN;
         if(_chatPopup != null || GuiManager.guiLayer == null)
         {
            return;
         }
         _chatPopup = new Sprite();
         // guiLayer uses the SWF's design coordinates even when the browser
         // stretches the Stage. Using stageWidth here scaled the popup twice.
         _loc6_ = 900;
         _loc7_ = 550;
         _chatPopup.mouseEnabled = false;
         _chatPopup.graphics.beginFill(0,0.48);
         _chatPopup.graphics.drawRect(0,0,_loc6_,_loc7_);
         _chatPopup.graphics.endFill();
         _loc1_ = new Sprite();
         _loc1_.x = (_loc6_ - 660) * 0.5;
         _loc1_.y = (_loc7_ - 500) * 0.5;
         _loc1_.mouseEnabled = false;
         _loc1_.graphics.lineStyle(5,0x73431F,1,true);
         _loc1_.graphics.beginFill(0xF2E2B9,1);
         _loc1_.graphics.drawRoundRect(0,0,660,500,28,28);
         _loc1_.graphics.endFill();
         _chatPopup.addChild(_loc1_);
         _chatPanel = _loc1_;
         _loc3_ = chatText("Chat Bubble",28,22,390,28,0x5A2C19,true);
         _loc1_.addChild(_loc3_);
         _loc1_.addChild(chatText("Click a colour square for the palette, or type a six-digit hex.",28,58,590,15,0x5A2C19,false));
         _chatFields = [];
         _chatSwatches = [];
         _loc4_ = 0;
         while(_loc4_ < CHAT_COLOUR_KEYS.length)
         {
            _loc5_ = String(CHAT_COLOUR_KEYS[_loc4_]);
            _loc1_.addChild(chatText(_loc4_ == 0 ? "Gradient start" : _loc4_ == 1 ? "Gradient end" : _loc5_.charAt(0).toUpperCase() + _loc5_.substr(1),30,95 + _loc4_ * 44,130,15,0x5A2C19,false));
            _loc3_ = chatText("",155,90 + _loc4_ * 44,105,17,0x342018,false);
            _loc3_.type = TextFieldType.INPUT;
            _loc3_.selectable = true;
            _loc3_.restrict = "0-9a-fA-F";
            _loc3_.maxChars = 6;
            _loc3_.background = true;
            _loc3_.backgroundColor = 0xFFFFFF;
            _loc3_.border = true;
            _loc3_.borderColor = 0x9A6A45;
            _loc3_.addEventListener(Event.CHANGE,onChatFieldChange,false,0,true);
            _loc1_.addChild(_loc3_);
            _chatFields.push(_loc3_);
            _loc2_ = new Sprite();
            _loc2_.x = 270;
            _loc2_.y = 92 + _loc4_ * 44;
            _loc2_.name = "chat-colour-" + _loc4_;
            _loc2_.mouseEnabled = true;
            _loc2_.buttonMode = true;
            _loc2_.addEventListener("mouseDown",onChatPopupMouse,false,0,true);
            _loc1_.addChild(_loc2_);
            _chatSwatches.push(_loc2_);
            _loc4_++;
         }
         _chatButtons = {};
         _chatPreview = new Sprite();
         _chatPreview.x = 335;
         _chatPreview.y = 92;
         _chatPreview.mouseEnabled = false;
         _chatPreview.mouseChildren = false;
         _chatPreview.addChild(chatText("Preview message",5,29,280,17,0x445559,true,"center"));
         _chatPreview.addEventListener(Event.ENTER_FRAME,onChatPreviewFrame,false,0,true);
         _loc1_.addChild(_chatPreview);
         _chatTrack = new Sprite();
         _chatTrack.x = 335;
         _chatTrack.y = 181;
         _loc1_.addChild(_chatTrack);
         _chatStopSprites = [];
         _loc2_ = chatButton("",335,215,175,"chat-preset");
         _loc1_.addChild(_loc2_);
         _chatButtons.preset = _loc2_;
         _loc2_ = chatButton("",520,215,115,"chat-position");
         _loc1_.addChild(_loc2_);
         _chatButtons.position = _loc2_;
         _loc1_.addChild(chatButton("Add",335,259,68,"chat-stop-add"));
         _loc1_.addChild(chatButton("Remove",410,259,68,"chat-stop-remove"));
         _loc1_.addChild(chatButton("Swap",485,259,68,"chat-swap"));
         _loc1_.addChild(chatButton("Random",560,259,75,"chat-random"));
         _loc2_ = chatButton("",30,307,180,"chat-gradient");
         _loc1_.addChild(_loc2_);
         _chatButtons.gradient = _loc2_;
         _loc2_ = chatButton("",240,307,180,"chat-angle");
         _loc1_.addChild(_loc2_);
         _chatButtons.angle = _loc2_;
         _loc2_ = chatButton("",450,307,180,"chat-strength");
         _loc1_.addChild(_loc2_);
         _chatButtons.strength = _loc2_;
         _loc2_ = chatButton("",30,351,180,"chat-animation");
         _loc1_.addChild(_loc2_);
         _chatButtons.animation = _loc2_;
         _loc2_ = chatButton("",240,351,180,"chat-opacity");
         _loc1_.addChild(_loc2_);
         _chatButtons.opacity = _loc2_;
         _loc2_ = chatButton("",450,351,180,"chat-speed");
         _loc1_.addChild(_loc2_);
         _chatButtons.speed = _loc2_;
         _loc2_ = chatButton("",30,397,190,"chat-enabled");
         _loc1_.addChild(_loc2_);
         _chatButtons.enabled = _loc2_;
         _loc2_ = chatButton("",235,397,130,"chat-outline");
         _loc1_.addChild(_loc2_);
         _chatButtons.outline = _loc2_;
         _loc1_.addChild(chatButton("Reset",380,397,110,"chat-reset"));
         _loc1_.addChild(chatButton("Save",505,397,125,"chat-save"));
         _loc2_ = chatButton("",30,441,190,"chat-animations");
         _loc1_.addChild(_loc2_);
         _chatButtons.animations = _loc2_;
         _chatStatus = chatText("",235,451,400,14,0x5A2C19,false);
         _loc1_.addChild(_chatStatus);
         _loc1_.addChild(chatButton("X",600,18,36,"chat-close"));
         GuiManager.guiLayer.addChild(_chatPopup);
         refreshChatPopup();
         // A request also handles a popup opened before the login response.
         gMainFrame.server.setXtObject_Str("xcs",[]);
      }

      private static function chatText(param1:String, param2:Number, param3:Number, param4:Number, param5:int, param6:uint, param7:Boolean, param8:String = null) : TextField
      {
         var _loc8_:TextField = new TextField();
         var _loc9_:TextFormat = new TextFormat("Arial",param5,param6,param7);
         _loc8_.x = param2;
         _loc8_.y = param3;
         _loc8_.width = param4;
         _loc8_.height = param5 + 8;
         if(param8 != null)
         {
            _loc9_.align = param8;
         }
         _loc8_.defaultTextFormat = _loc9_;
         _loc8_.text = param1;
         _loc8_.setTextFormat(_loc9_);
         _loc8_.selectable = false;
         return _loc8_;
      }

      private static function chatButton(param1:String, param2:Number, param3:Number, param4:Number, param5:String) : Sprite
      {
         var _loc6_:Sprite = new Sprite();
         var _loc7_:TextField = null;
         _loc6_.name = param5;
         _loc6_.x = param2;
         _loc6_.y = param3;
         _loc6_.buttonMode = true;
         _loc6_.mouseChildren = false;
         _loc6_.graphics.lineStyle(2,0x73431F,1,true);
         _loc6_.graphics.beginFill(0xE7C779,1);
         _loc6_.graphics.drawRoundRect(0,0,param4,37,14,14);
         _loc6_.graphics.endFill();
         _loc7_ = chatText(param1,5,7,param4 - 10,16,0x5A2C19,true,"center");
         _loc7_.mouseEnabled = false;
         _loc6_.addChild(_loc7_);
         _loc6_.addEventListener("mouseDown",onChatPopupMouse,false,0,true);
         return _loc6_;
      }

      private static function setChatButton(param1:Sprite, param2:String) : void
      {
         TextField(param1.getChildAt(0)).text = param2;
      }

      private static function refreshChatPopup(param1:Boolean = true) : void
      {
         var _loc1_:int = 0;
         if(_chatFields == null)
         {
            return;
         }
         if(param1)
         {
            while(_loc1_ < CHAT_COLOUR_KEYS.length)
            {
               TextField(_chatFields[_loc1_]).text = String(_chatStyle[CHAT_COLOUR_KEYS[_loc1_]]);
               _loc1_++;
            }
         }
         setChatButton(_chatButtons.preset,"Preset: " + (_chatPreset >= 0 ? CHAT_PRESETS[_chatPreset].name : "Custom"));
         setChatButton(_chatButtons.gradient,"Gradient: " + _chatStyle.gradient);
         setChatButton(_chatButtons.angle,"Direction: " + _chatStyle.angle + " degrees");
         setChatButton(_chatButtons.strength,"Strength: " + _chatStyle.strength + "%");
         setChatButton(_chatButtons.animation,"Animation: " + _chatStyle.animation);
         setChatButton(_chatButtons.opacity,"Opacity: " + _chatStyle.opacity + "%");
         setChatButton(_chatButtons.speed,"Speed: " + _chatStyle.speed + "%");
         setChatButton(_chatButtons.outline,"Outline: " + _chatStyle.outline + " px");
         setChatButton(_chatButtons.enabled,"Custom bubbles: " + (GuiManager.customChatBubblesEnabled() ? "On" : "Off"));
         setChatButton(_chatButtons.animations,"Animations: " + (GuiManager.chatBubbleAnimationsEnabled() ? "On" : "Off"));
         if(_chatSelectedStop < 0 || _chatSelectedStop >= _chatStops.length)
         {
            _chatSelectedStop = 0;
         }
         setChatButton(_chatButtons.position,(_chatSelectedStop + 1) + "/" + _chatStops.length + (_chatSelectedStop == 0 || _chatSelectedStop == _chatStops.length - 1 ? ": fixed" : ": " + _chatStops[_chatSelectedStop].position + "%"));
         drawChatGradientTrack();
         drawChatSwatches();
         drawChatPreview();
         _chatStatus.text = "";
      }

      private static function onChatFieldChange(param1:Event) : void
      {
         var _loc1_:int = 0;
         while(_loc1_ < CHAT_COLOUR_KEYS.length)
         {
            if(validChatHex(TextField(_chatFields[_loc1_]).text))
            {
               _chatStyle[CHAT_COLOUR_KEYS[_loc1_]] = TextField(_chatFields[_loc1_]).text.toLowerCase();
            }
            _loc1_++;
         }
         if(_chatStops && _chatStops.length >= 2)
         {
            _chatStops[0].color = _chatStyle.background;
            _chatStops[_chatStops.length - 1].color = _chatStyle.accent;
            syncChatStops();
         }
         _chatPreset = -1;
         setChatButton(_chatButtons.preset,"Preset: Custom");
         drawChatSwatches();
         drawChatPreview();
      }

      private static function parseChatStops(param1:String) : Array
      {
         var _loc1_:Array = [];
         var _loc2_:Array = String(param1 || "").split(";");
         var _loc3_:int = 0;
         var _loc4_:Array = null;
         while(_loc3_ < _loc2_.length && _loc2_.length >= 2 && _loc2_.length <= 5)
         {
            _loc4_ = String(_loc2_[_loc3_]).split(":");
            if(_loc4_.length != 2 || !validChatHex(String(_loc4_[0])) || isNaN(Number(_loc4_[1])))
            {
               _loc1_ = [];
               break;
            }
            _loc1_.push({"color":String(_loc4_[0]).toLowerCase(),"position":Math.max(0,Math.min(100,int(_loc4_[1])))});
            _loc3_++;
         }
         if(_loc1_.length < 2)
         {
            _loc1_ = [{"color":String(_chatStyle.background),"position":0},{"color":String(_chatStyle.accent),"position":100}];
         }
         _loc1_.sortOn("position",Array.NUMERIC);
         _loc1_[0].position = 0;
         _loc1_[_loc1_.length - 1].position = 100;
         return _loc1_;
      }

      private static function syncChatStops() : void
      {
         var _loc1_:Array = [];
         var _loc2_:int = 0;
         if(_chatStops == null || _chatStops.length < 2)
         {
            _chatStops = [{"color":String(_chatStyle.background),"position":0},{"color":String(_chatStyle.accent),"position":100}];
         }
         _chatStops.sortOn("position",Array.NUMERIC);
         _chatStops[0].position = 0;
         _chatStops[_chatStops.length - 1].position = 100;
         while(_loc2_ < _chatStops.length)
         {
            _loc1_.push(String(_chatStops[_loc2_].color) + ":" + int(_chatStops[_loc2_].position));
            _loc2_++;
         }
         _chatStyle.background = String(_chatStops[0].color);
         _chatStyle.accent = String(_chatStops[_chatStops.length - 1].color);
         _chatStyle.stops = _loc1_.join(";");
      }

      private static function drawChatGradientTrack() : void
      {
         var _loc1_:Array = [];
         var _loc2_:Array = [];
         var _loc3_:Array = [];
         var _loc4_:int = 0;
         var _loc5_:Sprite = null;
         var _loc6_:Matrix = null;
         if(_chatTrack == null)
         {
            return;
         }
         while(_chatTrack.numChildren > 0)
         {
            _chatTrack.removeChildAt(0);
         }
         _chatTrack.graphics.clear();
         while(_loc4_ < _chatStops.length)
         {
            _loc1_.push(uint(parseInt(_chatStops[_loc4_].color,16)));
            _loc2_.push(1);
            _loc3_.push(int(Number(_chatStops[_loc4_].position) * 2.55));
            _loc4_++;
         }
         _loc6_ = new Matrix();
         _loc6_.createGradientBox(300,14,0,0,0);
         _chatTrack.graphics.lineStyle(2,0x73431F,1,true);
         _chatTrack.graphics.beginGradientFill(GradientType.LINEAR,_loc1_,_loc2_,_loc3_,_loc6_);
         _chatTrack.graphics.drawRoundRect(0,0,300,14,8,8);
         _chatTrack.graphics.endFill();
         _chatStopSprites = [];
         _loc4_ = 0;
         while(_loc4_ < _chatStops.length)
         {
            _loc5_ = new Sprite();
            _loc5_.name = "chat-stop-" + _loc4_;
            _loc5_.x = Number(_chatStops[_loc4_].position) * 3 - 8;
            _loc5_.y = 14;
            _loc5_.buttonMode = true;
            _loc5_.graphics.lineStyle(_loc4_ == _chatSelectedStop ? 3 : 1,_loc4_ == _chatSelectedStop ? 0xFFFFFF : 0x73431F,1,true);
            _loc5_.graphics.beginFill(uint(parseInt(_chatStops[_loc4_].color,16)),1);
            _loc5_.graphics.drawCircle(8,8,7);
            _loc5_.graphics.endFill();
            _loc5_.addEventListener("mouseDown",onChatPopupMouse,false,0,true);
            _chatTrack.addChild(_loc5_);
            _chatStopSprites.push(_loc5_);
            _loc4_++;
         }
      }

      private static function chatBlend(param1:uint, param2:uint, param3:Number) : uint
      {
         var _loc4_:Number = 1 - param3;
         return uint((param1 >> 16 & 255) * _loc4_ + (param2 >> 16 & 255) * param3) << 16 |
            uint((param1 >> 8 & 255) * _loc4_ + (param2 >> 8 & 255) * param3) << 8 |
            uint((param1 & 255) * _loc4_ + (param2 & 255) * param3);
      }

      private static function chatHex(param1:uint) : String
      {
         var _loc2_:String = param1.toString(16);
         while(_loc2_.length < 6)
         {
            _loc2_ = "0" + _loc2_;
         }
         return _loc2_.substr(-6);
      }

      private static function chatRainbow(param1:Number) : uint
      {
         var _loc2_:int = int(param1 * 6) % 6;
         var _loc3_:Number = param1 * 6 - int(param1 * 6);
         var _loc4_:uint = uint(255 * _loc3_);
         var _loc5_:uint = 255 - _loc4_;
         if(_loc2_ == 0) return 0xFF0000 | _loc4_ << 8;
         if(_loc2_ == 1) return _loc5_ << 16 | 0xFF00;
         if(_loc2_ == 2) return 0x00FF00 | _loc4_;
         if(_loc2_ == 3) return _loc5_ << 8 | 0xFF;
         if(_loc2_ == 4) return _loc4_ << 16 | 0xFF;
         return 0xFF0000 | _loc5_ << 8;
      }

      private static function onChatPreviewFrame(param1:Event) : void
      {
         if(_chatStyle.animation != "none")
         {
            drawChatPreview();
         }
      }

      private static function drawChatSwatches() : void
      {
         var _loc1_:int = 0;
         while(_chatSwatches && _loc1_ < _chatSwatches.length)
         {
            Sprite(_chatSwatches[_loc1_]).graphics.clear();
            Sprite(_chatSwatches[_loc1_]).graphics.lineStyle(1,0x73431F,1,true);
            Sprite(_chatSwatches[_loc1_]).graphics.beginFill(uint(parseInt(_chatStyle[CHAT_COLOUR_KEYS[_loc1_]],16)),1);
            Sprite(_chatSwatches[_loc1_]).graphics.drawRoundRect(0,0,24,24,7,7);
            Sprite(_chatSwatches[_loc1_]).graphics.endFill();
            _loc1_++;
         }
      }

      private static function closeChatPalette() : void
      {
         if(_chatPalette && _chatPalette.parent)
         {
            _chatPalette.parent.removeChild(_chatPalette);
         }
         _chatPalette = null;
         _chatColourIndex = -1;
      }

      private static function openChatPalette(param1:int) : void
      {
         var _loc1_:int = 0;
         var _loc2_:String = null;
         var _loc3_:Sprite = null;
         if(_chatPanel == null || param1 < 0 || param1 > CHAT_COLOUR_KEYS.length)
         {
            return;
         }
         closeChatPalette();
         _chatColourIndex = param1;
         _chatPalette = new Sprite();
         _chatPalette.x = 296;
         _chatPalette.y = 76;
         _chatPalette.graphics.lineStyle(3,0x73431F,1,true);
         _chatPalette.graphics.beginFill(0xF8EDCE,1);
         _chatPalette.graphics.drawRoundRect(0,0,342,166,18,18);
         _chatPalette.graphics.endFill();
         _chatPalette.addChild(chatText("Choose " + (param1 == CHAT_COLOUR_KEYS.length ? "selected stop" : param1 == 0 ? "gradient start" : param1 == 1 ? "gradient end" : CHAT_COLOUR_KEYS[param1]),14,10,275,16,0x5A2C19,true));
         _chatPalette.addChild(chatButton("X",298,8,30,"chat-palette-close"));
         while(_loc1_ < CHAT_PALETTE.length)
         {
            _loc2_ = String(CHAT_PALETTE[_loc1_]);
            _loc3_ = new Sprite();
            _loc3_.name = "chat-pick-" + _loc2_;
            _loc3_.x = 15 + _loc1_ % 8 * 40;
            _loc3_.y = 46 + int(_loc1_ / 8) * 28;
            _loc3_.buttonMode = true;
            _loc3_.graphics.lineStyle(2,0x73431F,1,true);
            _loc3_.graphics.beginFill(uint(parseInt(_loc2_,16)),1);
            _loc3_.graphics.drawRoundRect(0,0,31,21,7,7);
            _loc3_.graphics.endFill();
            _loc3_.addEventListener("mouseDown",onChatPopupMouse,false,0,true);
            _chatPalette.addChild(_loc3_);
            _loc1_++;
         }
         _chatPanel.addChild(_chatPalette);
      }

      private static function drawChatPreview() : void
      {
         var _loc1_:uint = 0;
         var _loc2_:uint = 0;
         var _loc3_:uint = 0;
         var _loc4_:Matrix = null;
         var _loc5_:String = null;
         var _loc7_:Number = 0;
         var _loc8_:Array = [];
         var _loc9_:Array = [];
         var _loc10_:Array = [];
         var _loc11_:int = 0;
         var _loc12_:uint = 0;
         if(_chatPreview == null)
         {
            return;
         }
         _loc1_ = uint(parseInt(_chatStyle.background,16));
         _loc2_ = chatBlend(_loc1_,uint(parseInt(_chatStyle.accent,16)),Number(_chatStyle.strength) / 100);
         _loc3_ = uint(parseInt(_chatStyle.border,16));
         _loc7_ = (getTimer() * Number(_chatStyle.speed) / 100000) % 1;
         while(_loc11_ < _chatStops.length)
         {
            _loc12_ = uint(parseInt(_chatStops[_loc11_].color,16));
            if(_loc11_ > 0)
            {
               _loc12_ = chatBlend(_loc1_,_loc12_,Number(_chatStyle.strength) / 100);
            }
            if(_chatStyle.animation == "shimmer")
            {
               _loc12_ = chatBlend(_loc12_,_loc1,(Math.sin(_loc7_ * Math.PI * 2) + 1) * 0.5);
            }
            _loc8_.push(_loc12_);
            _loc9_.push(Number(_chatStyle.opacity) / 100);
            _loc10_.push(int(Number(_chatStops[_loc11_].position) * 2.55));
            _loc11_++;
         }
         _chatPreview.graphics.clear();
         _chatPreview.graphics.lineStyle(Math.max(0,Number(_chatStyle.outline)),_loc3_,1,true);
         if(_chatStyle.gradient == "solid")
         {
            _chatPreview.graphics.beginFill(_chatStyle.animation == "rainbow" ? chatRainbow(_loc7_) : _loc1_,Number(_chatStyle.opacity) / 100);
         }
         else
         {
            _loc4_ = new Matrix();
            _loc4_.createGradientBox(280,82,Number(_chatStyle.angle) * Math.PI / 180,0,0);
            _loc5_ = _chatStyle.gradient == "radial" ? GradientType.RADIAL : GradientType.LINEAR;
            if(_chatStyle.animation == "rainbow")
            {
               _chatPreview.graphics.beginGradientFill(_loc5_,[chatRainbow(_loc7_),chatRainbow((_loc7_ + 0.18) % 1),chatRainbow((_loc7_ + 0.36) % 1)],[Number(_chatStyle.opacity) / 100,Number(_chatStyle.opacity) / 100,Number(_chatStyle.opacity) / 100],[0,128,255],_loc4_);
            }
            else if(_chatStyle.animation == "flow")
            {
               _loc4_.createGradientBox(210,62,Number(_chatStyle.angle) * Math.PI / 180,(_loc7_ * 2 - 1) * 280,(_loc7_ * 2 - 1) * 82);
               _chatPreview.graphics.beginGradientFill(_loc5_,_loc8_,_loc9_,_loc10_,_loc4_,SpreadMethod.REFLECT);
            }
            else
            {
               _chatPreview.graphics.beginGradientFill(_loc5_,_loc8_,_loc9_,_loc10_,_loc4_);
            }
         }
         _chatPreview.graphics.drawRoundRect(0,0,280,82,22,22);
         _chatPreview.graphics.endFill();
         _chatPreview.alpha = _chatStyle.animation == "pulse" ? 0.6 + 0.4 * (Math.sin(_loc7_ * Math.PI * 2) + 1) * 0.5 : 1;
         TextField(_chatPreview.getChildAt(0)).textColor = uint(parseInt(_chatStyle.text,16));
      }

      private static function nextChatValue(param1:Array, param2:*) : *
      {
         var _loc3_:int = param1.indexOf(param2);
         return param1[(_loc3_ + 1 + param1.length) % param1.length];
      }

      private static function findChatPreset() : int
      {
         var _loc1_:int = 0;
         var _loc2_:String = null;
         var _loc3_:Boolean = false;
         while(_loc1_ < CHAT_PRESETS.length)
         {
            _loc3_ = true;
            for(_loc2_ in CHAT_PRESETS[_loc1_])
            {
               if(_loc2_ != "name" && String(CHAT_PRESETS[_loc1_][_loc2_]) != String(_chatStyle[_loc2_]))
               {
                  _loc3_ = false;
                  break;
               }
            }
            if(_loc3_ && String(_chatStyle.stops) != String(CHAT_PRESETS[_loc1_].background) + ":0;" + String(CHAT_PRESETS[_loc1_].accent) + ":100")
            {
               _loc3_ = false;
            }
            if(_loc3_)
            {
               return _loc1_;
            }
            _loc1_++;
         }
         return -1;
      }

      private static function validChatHex(param1:String) : Boolean
      {
         return /^[0-9a-fA-F]{6}$/.test(param1);
      }

      public static function closeChatBubbleEditor() : void
      {
         closeChatPalette();
         if(_chatPopup != null)
         {
            if(_chatPopup.parent != null)
            {
               _chatPopup.parent.removeChild(_chatPopup);
            }
         }
         _chatPopup = null;
         _chatFields = null;
         _chatButtons = null;
         _chatStatus = null;
         if(_chatPreview)
         {
            _chatPreview.removeEventListener(Event.ENTER_FRAME,onChatPreviewFrame);
         }
         _chatPreview = null;
         _chatSwatches = null;
         _chatPanel = null;
         _chatTrack = null;
         _chatStopSprites = null;
      }

      private static function onChatPopupMouse(param1:MouseEvent) : void
      {
         var _loc2_:DisplayObject = param1.target as DisplayObject;
         var _loc3_:String = null;
         var _loc4_:int = 0;
         var _loc9_:int = 0;
         var _loc10_:String = null;
         var _loc11_:int = 0;
         var _loc12_:int = 0;
         var _loc13_:int = 0;
         var _loc14_:int = 0;
         var _loc15_:String = null;
         var _loc16_:int = 0;
         var _loc17_:int = 0;
         var _loc18_:int = 0;
         var _loc19_:Array = null;
         param1.stopPropagation();
         while(_loc2_ != null && _loc2_ != _chatPopup && _loc2_.name.indexOf("chat-") != 0)
         {
            _loc2_ = _loc2_.parent;
         }
         if(_loc2_ == null || _loc2_ == _chatPopup)
         {
            return;
         }
         _loc3_ = _loc2_.name;
         if(_loc3_.indexOf("chat-stop-") == 0)
         {
            _chatSelectedStop = Math.max(0,Math.min(_chatStops.length - 1,int(_loc3_.substr(10))));
            refreshChatPopup(false);
            openChatPalette(CHAT_COLOUR_KEYS.length);
         }
         else if(_loc3_.indexOf("chat-colour-") == 0)
         {
            _loc9_ = int(_loc3_.substr(12));
            openChatPalette(_loc9_);
         }
         else if(_loc3_.indexOf("chat-pick-") == 0)
         {
            _loc10_ = _loc3_.substr(10).toLowerCase();
            if(_chatColourIndex >= 0 && _chatColourIndex <= CHAT_COLOUR_KEYS.length && validChatHex(_loc10_))
            {
               if(_chatColourIndex == CHAT_COLOUR_KEYS.length)
               {
                  _chatStops[_chatSelectedStop].color = _loc10_;
               }
               else
               {
                  _chatStyle[CHAT_COLOUR_KEYS[_chatColourIndex]] = _loc10_;
                  TextField(_chatFields[_chatColourIndex]).text = _loc10_;
                  if(_chatColourIndex == 0)
                  {
                     _chatStops[0].color = _loc10_;
                  }
                  else if(_chatColourIndex == 1)
                  {
                     _chatStops[_chatStops.length - 1].color = _loc10_;
                  }
               }
               syncChatStops();
               TextField(_chatFields[0]).text = _chatStyle.background;
               TextField(_chatFields[1]).text = _chatStyle.accent;
               _chatPreset = -1;
               closeChatPalette();
               refreshChatPopup(false);
               setChatButton(_chatButtons.preset,"Preset: Custom");
            }
         }
         else if(_loc3_ == "chat-palette-close")
         {
            closeChatPalette();
         }
         else if(_loc3_ == "chat-close")
         {
            closeChatBubbleEditor();
         }
         else if(_loc3_ == "chat-reset")
         {
            _chatStyle = {"background":"ffffff","accent":"dfe8ff","text":"445559","border":"9aabb0","opacity":75,"animation":"none","speed":100,"gradient":"linear","angle":45,"strength":100,"outline":1,"stops":"ffffff:0;dfe8ff:100"};
            _chatStops = parseChatStops(_chatStyle.stops);
            _chatSelectedStop = 0;
            _chatPreset = -1;
            refreshChatPopup();
         }
         else if(_loc3_ == "chat-preset")
         {
            _chatPreset = (_chatPreset + 1) % CHAT_PRESETS.length;
            var _loc5_:Object = CHAT_PRESETS[_chatPreset];
            for(var _loc6_:String in _loc5_)
            {
               if(_loc6_ != "name")
               {
                  _chatStyle[_loc6_] = _loc5_[_loc6_];
               }
            }
            _chatStyle.stops = String(_chatStyle.background) + ":0;" + String(_chatStyle.accent) + ":100";
            _chatStops = parseChatStops(_chatStyle.stops);
            _chatSelectedStop = 0;
            refreshChatPopup();
         }
         else if(_loc3_ == "chat-stop-add")
         {
            if(_chatStops.length >= 5)
            {
               _chatStatus.text = "A gradient can have up to five colours.";
               return;
            }
            _loc11_ = 0;
            _loc12_ = -1;
            _loc4_ = 0;
            while(_loc4_ < _chatStops.length - 1)
            {
               _loc13_ = int(_chatStops[_loc4_ + 1].position) - int(_chatStops[_loc4_].position);
               if(_loc13_ > _loc12_)
               {
                  _loc12_ = _loc13_;
                  _loc11_ = _loc4_;
               }
               _loc4_++;
            }
            _loc14_ = int((int(_chatStops[_loc11_].position) + int(_chatStops[_loc11_ + 1].position)) * 0.5);
            _loc15_ = chatHex(chatBlend(uint(parseInt(_chatStops[_loc11_].color,16)),uint(parseInt(_chatStops[_loc11_ + 1].color,16)),0.5));
            _chatStops.splice(_loc11_ + 1,0,{"color":_loc15_,"position":_loc14_});
            _chatSelectedStop = _loc11_ + 1;
            syncChatStops();
            _chatPreset = -1;
            refreshChatPopup();
            openChatPalette(CHAT_COLOUR_KEYS.length);
         }
         else if(_loc3_ == "chat-stop-remove")
         {
            if(_chatStops.length <= 2)
            {
               _chatStatus.text = "A gradient needs at least two colours.";
               return;
            }
            _chatStops.splice(_chatSelectedStop,1);
            _chatSelectedStop = Math.max(0,Math.min(_chatSelectedStop,_chatStops.length - 1));
            syncChatStops();
            _chatPreset = -1;
            refreshChatPopup();
         }
         else if(_loc3_ == "chat-position")
         {
            if(_chatSelectedStop == 0 || _chatSelectedStop == _chatStops.length - 1)
            {
               _chatStatus.text = "The first and last colours stay at 0% and 100%.";
               return;
            }
            _loc16_ = int(_chatStops[_chatSelectedStop - 1].position) + 5;
            _loc17_ = int(_chatStops[_chatSelectedStop + 1].position) - 5;
            _loc18_ = int(_chatStops[_chatSelectedStop].position) + 5;
            _chatStops[_chatSelectedStop].position = _loc18_ > _loc17_ ? _loc16_ : _loc18_;
            syncChatStops();
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-swap")
         {
            _loc19_ = [];
            _loc4_ = _chatStops.length - 1;
            while(_loc4_ >= 0)
            {
               _loc19_.push({"color":String(_chatStops[_loc4_].color),"position":100 - int(_chatStops[_loc4_].position)});
               _loc4_--;
            }
            _chatStops = _loc19_;
            _chatSelectedStop = _chatStops.length - 1 - _chatSelectedStop;
            syncChatStops();
            _chatPreset = -1;
            refreshChatPopup();
         }
         else if(_loc3_ == "chat-random")
         {
            _loc4_ = 0;
            while(_loc4_ < _chatStops.length)
            {
               _chatStops[_loc4_].color = chatHex(uint(Math.random() * 0x1000000));
               _loc4_++;
            }
            syncChatStops();
            _chatStyle.border = chatHex(uint(Math.random() * 0x1000000));
            var _loc8_:uint = uint(parseInt(_chatStyle.background,16));
            _chatStyle.text = ((_loc8_ >> 16 & 255) * 299 + (_loc8_ >> 8 & 255) * 587 + (_loc8_ & 255) * 114) / 1000 > 145 ? "342018" : "ffffff";
            _chatPreset = -1;
            refreshChatPopup();
         }
         else if(_loc3_ == "chat-gradient")
         {
            _chatStyle.gradient = nextChatValue(CHAT_GRADIENTS,_chatStyle.gradient);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-angle")
         {
            _chatStyle.angle = nextChatValue(CHAT_ANGLES,_chatStyle.angle);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-strength")
         {
            _chatStyle.strength = nextChatValue(CHAT_STRENGTHS,_chatStyle.strength);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-animation")
         {
            _chatStyle.animation = nextChatValue(CHAT_ANIMATIONS,_chatStyle.animation);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-opacity")
         {
            _chatStyle.opacity = nextChatValue(CHAT_OPACITIES,_chatStyle.opacity);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-speed")
         {
            _chatStyle.speed = nextChatValue(CHAT_SPEEDS,_chatStyle.speed);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-outline")
         {
            _chatStyle.outline = nextChatValue(CHAT_OUTLINES,_chatStyle.outline);
            _chatPreset = -1;
            refreshChatPopup(false);
         }
         else if(_loc3_ == "chat-enabled")
         {
            GuiManager.setCustomChatBubblesEnabled(!GuiManager.customChatBubblesEnabled());
            refreshChatPopup(false);
            _chatStatus.text = GuiManager.customChatBubblesEnabled() ? "Custom bubbles are visible on this client." : "Custom bubbles are hidden only on this client.";
         }
         else if(_loc3_ == "chat-animations")
         {
            GuiManager.setChatBubbleAnimationsEnabled(!GuiManager.chatBubbleAnimationsEnabled());
            refreshChatPopup(false);
            _chatStatus.text = GuiManager.chatBubbleAnimationsEnabled() ? "Bubbles move as their owners chose." : "Every bubble stands still on this client.";
         }
         else if(_loc3_ == "chat-save")
         {
            _loc4_ = 0;
            while(_loc4_ < CHAT_COLOUR_KEYS.length)
            {
               if(!validChatHex(TextField(_chatFields[_loc4_]).text))
               {
                  _chatStatus.text = "Each colour must be exactly six hexadecimal characters.";
                  return;
               }
               _chatStyle[CHAT_COLOUR_KEYS[_loc4_]] = TextField(_chatFields[_loc4_]).text.toLowerCase();
               _loc4_++;
            }
            _chatStatus.text = "Saving…";
            _chatStops[0].color = _chatStyle.background;
            _chatStops[_chatStops.length - 1].color = _chatStyle.accent;
            syncChatStops();
            gMainFrame.server.setXtObject_Str("xcs",[_chatStyle.background,_chatStyle.accent,_chatStyle.text,_chatStyle.border,_chatStyle.opacity,_chatStyle.animation,_chatStyle.speed,_chatStyle.gradient,_chatStyle.angle,_chatStyle.strength,_chatStyle.outline,_chatStyle.stops]);
         }
      }
      
      private function handleMouseDown(param1:MouseEvent) : void
      {
         var _loc2_:Number = NaN;
         var _loc5_:int = 0;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc6_:int = 0;
         var _loc7_:Boolean = false;
         param1.stopPropagation();
         if(_currItem.type == MySettings.TOGGLE_TYPE_TOGGLE_BTN)
         {
            switch(_currItem.frame)
            {
               case "lock":
                  _lock = MovieClip(param1.currentTarget);
                  GuiManager.onToggleDenLock(onDenLockUnlock);
                  break;
               case "music":
                  handleMuteUnmute();
                  break;
               case "wasd":
               case "hideBlocked":
               case "customArt":
                  _loc7_ = !ownSwitchOn();
                  setOwnSwitch(_loc7_);
                  param1.currentTarget.toggleBtn.gotoAndPlay(_loc7_ ? "on" : "off");
                  break;
               case "buddyRequest":
               case "gameInvites":
               case "doorBell":
               case "autoServer":
               case "nameBadge":
               case "denPlayerIcon":
               case "jammerWallIcon":
               case "predictTxt":
                  _loc2_ = Number(gMainFrame.userInfo.userVarCache.getUserVarValueById(363));
                  _loc5_ = -1;
                  if(_currItem.frame == "buddyRequest")
                  {
                     _loc5_ = MySettings.SETTINGS_BUDDY_REQUESTS;
                  }
                  else if(_currItem.frame == "gameInvites")
                  {
                     _loc5_ = MySettings.SETTINGS_GAME_INVITES;
                  }
                  else if(_currItem.frame == "doorBell")
                  {
                     _loc5_ = MySettings.SETTINGS_DOOR_BELL;
                  }
                  else if(_currItem.frame == "autoServer")
                  {
                     _loc5_ = MySettings.SETTINGS_AUTO_SERVER_TRAVEL;
                  }
                  else if(_currItem.frame == "nameBadge")
                  {
                     _loc5_ = MySettings.SETTINGS_USERNAME_BADGE;
                  }
                  else if(_currItem.frame == "denPlayerIcon")
                  {
                     _loc5_ = MySettings.SETTINGS_DEN_PLAYER_ICON;
                  }
                  else if(_currItem.frame == "jammerWallIcon")
                  {
                     _loc5_ = MySettings.SETTINGS_JAMMER_WALL_ICON;
                  }
                  else if(_currItem.frame == "predictTxt")
                  {
                     _loc5_ = MySettings.SETTINGS_CHAT_PREDICTION;
                     if(gMainFrame.userInfo.sgChatType == 1)
                     {
                        if(!Utility.hasChatSettingBeenSet())
                        {
                           AchievementXtCommManager.requestSetUserVar(363,_loc5_);
                           _loc2_ = 0;
                        }
                     }
                     if(!Utility.hasChatSettingBeenSet())
                     {
                        AchievementXtCommManager.requestSetUserVar(452,1);
                     }
                  }
                  if(_loc5_ != -1)
                  {
                     if(_loc2_ == -1)
                     {
                        if(_loc5_ == MySettings.SETTINGS_DOOR_BELL || _loc5_ == MySettings.SETTINGS_USERNAME_BADGE)
                        {
                           param1.currentTarget.toggleBtn.gotoAndPlay("on");
                           if(_window.icon["" + _window.icon.currentFrameLabel].currentLabel)
                           {
                              _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("on");
                           }
                        }
                        else
                        {
                           param1.currentTarget.toggleBtn.gotoAndPlay("off");
                           if(_window.icon["" + _window.icon.currentFrameLabel].currentLabel)
                           {
                              _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("off");
                           }
                        }
                        AchievementXtCommManager.requestSetUserVar(363,_loc5_);
                     }
                     else if(param1.currentTarget.toggleBtn.currentFrameLabel == "on" || param1.currentTarget.toggleBtn.currentFrameLabel == "startingOn")
                     {
                        param1.currentTarget.toggleBtn.gotoAndPlay("off");
                        if(_window.icon["" + _window.icon.currentFrameLabel].currentLabel)
                        {
                           _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("off");
                        }
                        if(_loc5_ == MySettings.SETTINGS_DOOR_BELL || _loc5_ == MySettings.SETTINGS_USERNAME_BADGE)
                        {
                           AchievementXtCommManager.requestSetUserVar(363,_loc5_,null,false);
                        }
                        else
                        {
                           AchievementXtCommManager.requestSetUserVar(363,_loc5_);
                        }
                     }
                     else
                     {
                        param1.currentTarget.toggleBtn.gotoAndPlay("on");
                        if(_window.icon["" + _window.icon.currentFrameLabel].currentLabel)
                        {
                           _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("on");
                        }
                        if(_loc5_ == MySettings.SETTINGS_DOOR_BELL || _loc5_ == MySettings.SETTINGS_USERNAME_BADGE)
                        {
                           AchievementXtCommManager.requestSetUserVar(363,_loc5_);
                        }
                        else
                        {
                           AchievementXtCommManager.requestSetUserVar(363,_loc5_,null,false);
                        }
                     }
                     if(_loc5_ == MySettings.SETTINGS_JAMMER_WALL_ICON)
                     {
                        GuiManager.updateMainHudButtons(false,{
                           "btnName":(GuiManager.mainHud as GuiHud).playerWallBtn.name,
                           "show":param1.currentTarget.toggleBtn.currentLabel == "on"
                        });
                     }
                  }
            }
            setToggleLabels();
         }
         else if(_currItem.type == MySettings.TOGGLE_TYPE_CURSOR)
         {
            if(param1.currentTarget.mouse.currentFrame == 3)
            {
               param1.currentTarget.mouseEnabled = false;
               param1.currentTarget.mouseChildren = false;
            }
            if(param1.currentTarget != _window.defaultCursorBtn)
            {
               GuiManager.setSharedObj("cursor","custom");
               CursorManager.switchToCursor("custom_cursor");
               _window.defaultCursorBtn.downToUpState();
               _window.defaultCursorBtn.mouseEnabled = true;
               _window.defaultCursorBtn.mouseChildren = true;
            }
            else
            {
               GuiManager.setSharedObj("cursor","default");
               CursorManager.switchToCursor("Default_Cursor");
               _window.woodenCursorBtn.downToUpState();
               _window.woodenCursorBtn.mouseEnabled = true;
               _window.woodenCursorBtn.mouseChildren = true;
            }
         }
         else if(_currItem.type == MySettings.TOGGLE_TYPE_JOIN)
         {
            switch(_currItem.frame)
            {
               case "world":
                  ServerSelector.init(GuiManager.guiLayer,null,GamePlay(gMainFrame.gamePlay).joinChosenShardIdNode);
                  break;
               case "intro":
                  GuiManager.startFFM();
                  break;
               case "itemFinder":
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  AJClient.openTool(0);
                  break;
               case "itemMaker":
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  AJClient.openTool(2);
                  break;
               case "chatFilter":
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  AJClient.openTool(1);
                  break;
               case "chatBubble":
                  showChatBubbleEditor();
                  break;
               case "themeMenu":
                  if(_mySettingsThemesFunction != null)
                  {
                     _mySettingsThemesFunction();
                  }
                  break;
               case "themePick":
                  _loc3_ = _currItem.theme;
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  AJClient.setTheme(_loc3_);
                  break;
               case "savedMenu":
                  if(_currItem.run != null)
                  {
                     _currItem.run(_currItem.kind);
                  }
                  break;
               case "commandPick":
                  _loc3_ = _currItem.command;
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  AJClient.runCommand(_loc3_);
                  break;
               case "expandedInventory":
                  setExpandedInventory(!AJClient.expandedInventoryOn());
                  break;
               case "performance":
                  nextPerformance();
                  break;
               case "graphics":
                  setChoice(9003,AJClient.smoothOn() ? 1 : 2);
                  showGraphics();
                  break;
               case "frameRate":
                  nextFrameRate();
                  break;
               case "camera":
                  setChoice(9005,AJClient.cameraEases() ? 2 : 1);
                  showCamera();
                  break;
               case "redeemCode":
                  if(_mySettingsCloseFunction != null)
                  {
                     _mySettingsCloseFunction(null);
                  }
                  GuiManager.openCodeRedemptionPopup();
                  break;
               case "verifyEmail":
                  GuiManager.initEmailConfirmation(null,null,false);
                  break;
               case "twoFactor":
                  // the account page, where two-step sign-in is set up. the
                  // game's webview may open no window: the page asks the
                  // client to open it in the system browser (game.html
                  // ajOpenPage), as the client's own Manage Account does.
                  _loc3_ = gMainFrame.clientInfo.websiteURL + "account";
                  try
                  {
                     if(ExternalInterface.available)
                     {
                        ExternalInterface.call("ajOpenPage",_loc3_);
                     }
                     else
                     {
                        navigateToURL(new URLRequest(_loc3_),"_blank");
                     }
                  }
                  catch(e:Error)
                  {
                     DebugUtility.debugTrace("error with loading URL: " + _loc3_);
                  }
            }
         }
         else if(_currItem.type == MySettings.TOGGLE_TYPE_SCRUB)
         {
            param1.currentTarget.scrubKnob.dragging = true;
            param1.currentTarget.scrubKnob.startDrag(true,SLIDER_RECT);
            if(_musicToggle == null)
            {
               _loc4_ = (this.parent.parent as MovieClip).mediaWindows;
               _loc6_ = 0;
               while(_loc6_ < _loc4_.length)
               {
                  if(_loc4_[_loc6_].currFrameLabel == "music")
                  {
                     _musicToggle = _loc4_[_loc6_];
                  }
                  _loc6_++;
               }
            }
         }
      }
      
      public function handleMouseMove(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_currItem.type == MySettings.TOGGLE_TYPE_SCRUB && _window.scrubBtn.scrubKnob.dragging)
         {
            if(_currItem.sound)
            {
               // heard as it moves, kept when let go (handleStopScrubbing)
               AJClient.setSoundVolume(_currItem.sound,(int(_window.scrubBtn.scrubKnob.x - 15)) / 82,false);
            }
            else
            {
               SBAudio.setVolumeAll((int(_window.scrubBtn.scrubKnob.x - 15)) / 82);
            }
         }
      }
      
      private function handleMouseUp(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_currItem.type == MySettings.TOGGLE_TYPE_SCRUB)
         {
            handleStopScrubbing();
         }
      }
      
      private function handleMouseOut(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_currItem.type == MySettings.TOGGLE_TYPE_TOGGLE_BTN)
         {
            if(param1.currentTarget.toggleBtn.toggleBG.currentFrameLabel != "up")
            {
               param1.currentTarget.toggleBtn.toggleBG.gotoAndStop("up");
            }
            if(param1.currentTarget.toggleBtn.toggleKnob.currentFrameLabel != "up")
            {
               param1.currentTarget.toggleBtn.toggleKnob.gotoAndStop("up");
            }
         }
         else if(_currItem.type == MySettings.TOGGLE_TYPE_SCRUB)
         {
            if(param1.currentTarget == _window.scrubBtn)
            {
               if(_window.scrubBtn.scrubBG.currentFrameLabel != "up")
               {
                  _window.scrubBtn.scrubBG.gotoAndStop("up");
               }
               if(_window.scrubBtn.scrubKnob.currentFrameLabel != "up")
               {
                  _window.scrubBtn.scrubKnob.gotoAndStop("up");
               }
            }
            else
            {
               handleStopScrubbing();
            }
         }
      }
      
      private function handleMouseOver(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(_currItem.type == MySettings.TOGGLE_TYPE_TOGGLE_BTN)
         {
            if(param1.currentTarget.toggleBtn.toggleBG.currentFrameLabel != "over")
            {
               param1.currentTarget.toggleBtn.toggleBG.gotoAndStop("over");
            }
            if(param1.currentTarget.toggleBtn.toggleKnob.currentFrameLabel != "over")
            {
               param1.currentTarget.toggleBtn.toggleKnob.gotoAndStop("over");
            }
         }
         else if(_currItem.type == MySettings.TOGGLE_TYPE_SCRUB)
         {
            if(param1.currentTarget.scrubBG.currentFrameLabel != "over")
            {
               param1.currentTarget.scrubBG.gotoAndStop("over");
            }
            if(param1.currentTarget.scrubKnob.currentFrameLabel != "over")
            {
               param1.currentTarget.scrubKnob.gotoAndStop("over");
            }
         }
      }
      
      private function handleStopScrubbing() : void
      {
         if(_window.scrubBtn.scrubKnob.dragging && _currItem.sound)
         {
            _window.scrubBtn.scrubKnob.dragging = false;
            _window.scrubBtn.scrubKnob.stopDrag();
            AJClient.setSoundVolume(_currItem.sound,(int(_window.scrubBtn.scrubKnob.x - 15)) / 82);
         }
         else if(_window.scrubBtn.scrubKnob.dragging)
         {
            _window.scrubBtn.scrubKnob.dragging = false;
            _window.scrubBtn.scrubKnob.stopDrag();
            GuiManager.setSharedObj("volume",SBAudio.getVolumeMusic());
            if(SBAudio.currentVolume == 0 && !SBAudio.isMusicMuted)
            {
               if(_musicToggle)
               {
                  _musicToggle.handleMuteUnmute();
               }
               else
               {
                  handleMuteUnmute();
               }
            }
            else if(SBAudio.currentVolume != 0 && SBAudio.isMusicMuted)
            {
               if(_musicToggle)
               {
                  _musicToggle.handleMuteUnmute();
               }
               else
               {
                  handleMuteUnmute();
               }
            }
         }
      }
      
      private function handleMuteUnmute() : void
      {
         SBAudio.toggleMuteAll();
         GuiManager.toggleMuteVideo();
         if(SBAudio.isMusicMuted || SBAudio.areSoundsMuted)
         {
            _window.toggleBtn.toggleBtn.gotoAndPlay("off");
            _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("off");
            GuiManager.depressSoundButton(true);
         }
         else
         {
            _window.toggleBtn.toggleBtn.gotoAndPlay("on");
            _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("on");
            GuiManager.depressSoundButton(false);
         }
      }
      
      private function onDenLockUnlock(param1:Boolean = true) : void
      {
         if(param1)
         {
            if(gMainFrame.userInfo.denPrivacySettings == 0)
            {
               gMainFrame.userInfo.denPrivacySettings = 2;
            }
            else
            {
               gMainFrame.userInfo.denPrivacySettings = 0;
            }
            DenXtCommManager.requestSetDenPrivacy(gMainFrame.userInfo.denPrivacySettings);
            GuiManager.refreshDenLockSettings();
         }
         if(gMainFrame.userInfo.denPrivacySettings != 2)
         {
            _lock.toggleBtn.gotoAndPlay("off");
            if(_window)
            {
               _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("off");
            }
         }
         else
         {
            _lock.toggleBtn.gotoAndPlay("on");
            if(_window)
            {
               _window.icon["" + _window.icon.currentFrameLabel].gotoAndPlay("on");
            }
         }
      }
   }
}

