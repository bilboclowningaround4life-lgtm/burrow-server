package gui.itemWindows
{
   import achievement.AchievementXtCommManager;
   import com.sbi.corelib.audio.SBAudio;
   import com.sbi.debug.DebugUtility;
   import den.DenXtCommManager;
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.DisplayObject;
   import flash.display.MovieClip;
   import flash.geom.Matrix;
   import flash.events.MouseEvent;
   import flash.geom.Rectangle;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
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
               _window.icon.gotoAndStop(_currItem.frame);
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
            case "themeMenu":
            case "themePick":
            case "savedMenu":
            case "commandPick":
               _window.goNowBtn.down.txt.text = _currItem.btnLabel;
               _window.goNowBtn.mouse.mouse.txt.text = _currItem.btnLabel;
               _window.goNowBtn.mouse.up.txt.text = _currItem.btnLabel;
               _window.labelTxtCont.labelTxt.text = _currItem.labelLabel;
               break;
            case "hideBlocked":
               showHideBlocked();
               break;
            case "customArt":
               showCustomArt();
               break;
            case "expandedInventory":
               showExpandedInventory();
               break;
            case "wasd":
               showWasd();
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
      
      // "WASD Movement": walking with those four keys as well as the
      // arrow keys (room.RoomManagerView). user var 9002, not one of the game's.
      private function showWasd() : void
      {
         var _loc1_:String = AJClient.wasdOn() ? "Turn off" : "Turn on";
         _window.goNowBtn.down.txt.text = _loc1_;
         _window.goNowBtn.mouse.mouse.txt.text = _loc1_;
         _window.goNowBtn.mouse.up.txt.text = _loc1_;
         _window.labelTxtCont.labelTxt.text = "WASD Movement";
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

      private function nextPerformance() : void
      {
         var _loc1_:int = AJClient.performanceProfile();
         setChoice(9007,_loc1_ == 0 ? 1 : (_loc1_ == 1 ? 2 : 0));
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
         showWasd();
      }
      
      private function blockedAreHidden() : Boolean
      {
         return gMainFrame.userInfo.userVarCache.getUserVarValueById(9001) == 1;
      }
      
      private function showHideBlocked() : void
      {
         var _loc1_:String = blockedAreHidden() ? "Show" : "Hide";
         _window.goNowBtn.down.txt.text = _loc1_;
         _window.goNowBtn.mouse.mouse.txt.text = _loc1_;
         _window.goNowBtn.mouse.up.txt.text = _loc1_;
         _window.labelTxtCont.labelTxt.text = blockedAreHidden() ? "Blocked players: hidden" : "Blocked players: shown";
      }
      
      private function setHideBlocked(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9001,param1 ? 1 : 0);
         AchievementXtCommManager.requestSetUserVar(9001,param1 ? 1 : 0);
         showHideBlocked();
      }
      
      // "Custom pictures": the pictures players give their items, or every
      // item with its base's art (AJClient.customArtOn). user var 9006.
      private function showCustomArt() : void
      {
         var _loc1_:String = AJClient.customArtOn() ? "Hide" : "Show";
         _window.goNowBtn.down.txt.text = _loc1_;
         _window.goNowBtn.mouse.mouse.txt.text = _loc1_;
         _window.goNowBtn.mouse.up.txt.text = _loc1_;
         _window.labelTxtCont.labelTxt.text = AJClient.customArtOn() ? "Custom pictures: shown" : "Custom pictures: hidden";
      }
      
      private function setCustomArt(param1:Boolean) : void
      {
         gMainFrame.userInfo.userVarCache.updateUserVar(9006,param1 ? 0 : 1);
         AchievementXtCommManager.requestSetUserVar(9006,param1 ? 0 : 1);
         showCustomArt();
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

      
      private function handleMouseDown(param1:MouseEvent) : void
      {
         var _loc2_:Number = NaN;
         var _loc5_:int = 0;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc6_:int = 0;
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
            LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.onTxt,_currItem.onTxt);
            LocalizationManager.translateId(_window.toggleBtn.toggleBtn.valueTxt.offTxt,_currItem.offTxt);
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
               case "hideBlocked":
                  setHideBlocked(!blockedAreHidden());
                  break;
               case "customArt":
                  setCustomArt(!AJClient.customArtOn());
                  break;
               case "expandedInventory":
                  setExpandedInventory(!AJClient.expandedInventoryOn());
                  break;
               case "wasd":
                  setWasd(!AJClient.wasdOn());
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
                  _loc3_ = gMainFrame.clientInfo.websiteURL + "parents";
                  try
                  {
                     navigateToURL(new URLRequest(_loc3_),"_blank");
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

