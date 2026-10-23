package gui
{
   import flash.display.MovieClip;
   import flash.events.*;
   import flash.net.URLLoader;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   import flash.utils.setTimeout;
   import gui.itemWindows.ItemWindowToggle;
   import localization.LocalizationManager;
   
   public class MySettings
   {
      
      public static var SETTINGS_BUDDY_REQUESTS:int = 0;
      
      public static var SETTINGS_GAME_INVITES:int = 1;
      
      public static var SETTINGS_DOOR_BELL:int = 2;
      
      public static var SETTINGS_AUTO_SERVER_TRAVEL:int = 3;
      
      public static var SETTINGS_USERNAME_BADGE:int = 4;
      
      public static var SETTINGS_DEN_PLAYER_ICON:int = 5;
      
      public static var SETTINGS_JAMMER_WALL_ICON:int = 6;
      
      public static var SETTINGS_CHAT_PREDICTION:int = 7;
      
      public static var TOGGLE_TYPE_TOGGLE_BTN:int = 0;
      
      public static var TOGGLE_TYPE_TEXT:int = 1;
      
      public static var TOGGLE_TYPE_CURSOR:int = 2;
      
      public static var TOGGLE_TYPE_JOIN:int = 3;
      
      public static var TOGGLE_TYPE_SCRUB:int = 4;
      
      private var _mySettings:MovieClip;
      
      private var _popupLayer:DisplayLayer;
      
      private var _closeCallback:Function;
      
      private var _wallPrivacyDropDown:GuiDropdown;
      
      private var _toggleWindows:WindowGenerator;
      
      private var _toggleScrollBar:SBScrollbar;
      
      private var _savedKind:String;
      
      private var _visibleRows:int;
      
      private var _listWidth:int;
      
      private var _listHeight:int;
      
      public function MySettings()
      {
         super();
      }
      
      public function init(param1:DisplayLayer, param2:int, param3:int, param4:Function = null) : void
      {
         _popupLayer = param1;
         _closeCallback = param4;
         _mySettings = GETDEFINITIONBYNAME("MySettings");
         _mySettings.x = param2;
         _mySettings.y = param3;
         _popupLayer.addChild(_mySettings);
         setupContent();
         addEventListeners();
      }
      
      public function destroy() : void
      {
         // Never leave the editor's full-screen layer behind to swallow
         // clicks after Settings is closed by another path.
         ItemWindowToggle.closeChatBubbleEditor();
         removeEventListeners();
         _popupLayer.removeChild(_mySettings);
         _closeCallback = null;
         _mySettings = null;
         if(_toggleWindows)
         {
            _toggleWindows.destroy();
            _toggleWindows = null;
         }
         if(_toggleScrollBar)
         {
            _toggleScrollBar.destroy();
            _toggleWindows = null;
         }
      }
      
      public function updateSoundBtn() : void
      {
         var _loc1_:int = 0;
         _loc1_ = 0;
         while(_loc1_ < _toggleWindows.bg.numChildren)
         {
            if((_toggleWindows.bg.getChildAt(_loc1_) as ItemWindowToggle).currFrameLabel == "music")
            {
               (_toggleWindows.bg.getChildAt(_loc1_) as ItemWindowToggle).resetConditions();
               break;
            }
            _loc1_++;
         }
      }
      
      public function updateWorldMessage() : void
      {
      }
      
      private function setupContent() : void
      {
         var _loc2_:int = 0;
         var _loc5_:int = 0;
         var _loc3_:int = 0;
         var _loc1_:int = 0;
         if(gMainFrame.userInfo.isMember)
         {
            _mySettings.statusNonmember.visible = false;
            _loc1_ = int(gMainFrame.clientInfo.numDaysLeftOnSubscription);
            if(_loc1_ > 0)
            {
               _mySettings.gotoAndStop("memberScrollSubscription");
               _loc2_ = 5;
            }
            else
            {
               _mySettings.gotoAndStop("memberScroll");
               _loc2_ = 6;
            }
            _loc5_ = int(_mySettings.itemWindow.height);
            _loc3_ = int(_mySettings.itemWindow.width);
            if(_loc1_ > 0)
            {
               if(_loc1_ > 1)
               {
                  LocalizationManager.translateIdAndInsert(_mySettings.timeRemaining.timeTxt,11361,_loc1_);
               }
               else
               {
                  LocalizationManager.translateIdAndInsert(_mySettings.timeRemaining.timeTxt,11362,_loc1_);
               }
            }
         }
         else
         {
            _mySettings.statusMember.visible = false;
            _mySettings.gotoAndStop("nonMemScroll");
            _mySettings.joinBtn.addEventListener("mouseDown",onJoinBtn,false,0,true);
            _loc2_ = 5;
            _loc5_ = int(_mySettings.itemWindow.height);
            _loc3_ = int(_mySettings.itemWindow.width);
         }
         var _loc4_:Array = [{
            "type":TOGGLE_TYPE_JOIN,
            // the web item giver (AJClient.openTool), in the browser
            "frame":"itemFinder",
            "iconFrame":"redeemCode",
            "labelLabel":"Item Giver (web)",
            "btnLabel":"Open"
         },{
            // a player's own items (AJClient's Item Maker)
            "type":TOGGLE_TYPE_JOIN,
            "frame":"itemMaker",
            "iconFrame":"redeemCode",
            "labelLabel":"Item Maker",
            "btnLabel":"Open"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"chatFilter",
            "iconFrame":"buddyRequest",
            "labelLabel":"Chat Filter",
            "btnLabel":"Open"
         },{
            // Chat appearance is account-wide; this opens the centered
            // in-game editor rather than burying it in the emoji picker.
            "type":TOGGLE_TYPE_JOIN,
            "frame":"chatBubble",
            // Reuse Predict Chat's ABC artwork and keep it in its on state.
            "iconFrame":"predictTxt",
            "labelLabel":"Chat Bubble",
            "btnLabel":"Customize"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"themeMenu",
            "iconFrame":"world",
            "labelLabel":"Theme",
            "btnLabel":"Choose"
         /* the Outfits and Den layouts rows are out for now (too messy, the
            owner's word): saved outfits and layouts are chat commands only
            (!outfit, !den). showSavedList and what it needs are kept below.
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"savedMenu",
            "iconFrame":"nameBadge",
            "labelLabel":"Outfits",
            "btnLabel":"Choose",
            "kind":"outfits",
            "run":showSavedList
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"savedMenu",
            "iconFrame":"house",
            "labelLabel":"Den layouts",
            "btnLabel":"Choose",
            "kind":"layouts",
            "run":showSavedList
         */
         },{
            // this server's switches, drawn as the Nametag row is: the two
            // choices named either side of the knob (ItemWindowToggle)
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"wasd",
            "iconFrame":"world",
            "labelLabel":"WASD Movement",
            "onLabel":"On",
            "offLabel":"Off"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"performance",
            "iconFrame":"world"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"graphics",
            "iconFrame":"world"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"frameRate",
            "iconFrame":"world"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"camera",
            "iconFrame":"world"
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"hideBlocked",
            "iconFrame":"buddyRequest",
            "labelLabel":"Blocked Players",
            "onLabel":"Shown",
            "offLabel":"Hidden"
         },{
            // the pictures players give their items (AJClient.customArtOn)
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"customArt",
            "iconFrame":"redeemCode",
            "labelLabel":"Custom Items",
            "onLabel":"Shown",
            "offLabel":"Hidden"
         },{
            // more, smaller items a row in the clothes and item pickers
            // (AJClient.expandedInventoryOn)
            "type":TOGGLE_TYPE_JOIN,
            "frame":"expandedInventory",
            "iconFrame":"redeemCode"
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"redeemCode",
            "labelTxt":24819,
            "btnTxt":24820
         },{
            // the world picker (gui.ServerSelector): the server's worlds,
            // config.shards, listed by the server's answer to "rm"
            "type":TOGGLE_TYPE_JOIN,
            "frame":"world",
            "labelTxt":6395,
            "btnTxt":6366
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"nameBadge",
            "labelTxt":23912,
            "onTxt":6241,
            "offTxt":23918
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"jammerWallIcon",
            "labelTxt":27948,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"lock",
            "labelTxt":6271,
            "onTxt":6393,
            "offTxt":6301
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"denPlayerIcon",
            "labelTxt":25452,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"doorBell",
            "labelTxt":18420,
            "onTxt":6324,
            "offTxt":6322
         },{
            // music and sound effects apart, a volume each (AJClient's
            // sound settings), for the game's one sound switch and volume
            "type":TOGGLE_TYPE_SCRUB,
            "frame":"",
            "sound":"music",
            "labelLabel":"Music"
         },{
            "type":TOGGLE_TYPE_SCRUB,
            "frame":"",
            "sound":"sfx",
            "labelLabel":"SFX"
         },{
            "type":TOGGLE_TYPE_CURSOR,
            "frame":"",
            "labelTxt":6269
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"buddyRequest",
            "labelTxt":6251,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"gameInvites",
            "labelTxt":6282,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"autoServer",
            "labelTxt":23667,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_TOGGLE_BTN,
            "frame":"predictTxt",
            "labelTxt":29116,
            "onTxt":6324,
            "offTxt":6322
         },{
            "type":TOGGLE_TYPE_JOIN,
            "frame":"twoFactor",
            "labelTxt":36824,
            "btnTxt":36825
         }];
         if(gMainFrame.clientInfo.userEmail == null || gMainFrame.clientInfo.userEmail == "")
         {
            _loc4_.splice(3,0,{
               "type":TOGGLE_TYPE_JOIN,
               "frame":"verifyEmail",
               "labelTxt":33036,
               "btnTxt":33035
            });
         }
         _visibleRows = _loc2_;
         _listWidth = _loc3_;
         _listHeight = _loc5_;
         _toggleWindows = new WindowGenerator();
         _toggleWindows.init(1,_loc2_,_loc4_.length,0,4,0,ItemWindowToggle,_loc4_,null,null,{
            "onClose":onClose,
            "onThemes":showThemeList
         });
         _mySettings.itemWindow.addChild(_toggleWindows);
         _toggleScrollBar = new SBScrollbar();
         _toggleScrollBar.init(_toggleWindows,_loc3_,_loc5_,2,"scrollbar2",_toggleWindows.boxHeight + 4);
      }
      
      private function showThemeList() : void
      {
         setTimeout(buildThemeList,1);
      }
      
      private function buildThemeList() : void
      {
         var _loc1_:Array = [["","Current"],["halloween","Halloween"],["fall","Fall"],["jamaalidays","Jamaalidays"],["winter","Winter"],["friendship","Friendship"],["lucky","Lucky Day"],["spring","Spring"],["summer","Summer"],["halloween2025","Halloween 2025"],["fall2025","Fall 2025"],["summer2025","Summer 2025"],["lucky2025","Lucky Day 2025"],["summer2024","Summer 2024"],["spring2024","Spring 2024"],["lucky2024","Lucky Day 2024"],["jamaalidays2022","Jamaalidays 2022"],["fall2022","Fall 2022"],["freedom2021","Freedom Day 2021"],["jamaalidays2020","Jamaalidays 2020"],["spring2020","Spring 2020"],["jamaalidays2018","Jamaalidays 2018"],["summer2018","Summer 2018"],["lucky2018","Lucky Day 2018"],["friendship2018","Friendship 2018"],["halloween2013","Halloween 2013"]];
         var _loc2_:Array = [];
         var _loc3_:int = 0;
         while(_loc3_ < _loc1_.length)
         {
            _loc2_.push({
               "type":TOGGLE_TYPE_JOIN,
               "frame":"themePick",
               "iconFrame":"world",
               "labelLabel":_loc1_[_loc3_][1],
               "btnLabel":"Choose",
               "theme":_loc1_[_loc3_][0]
            });
            _loc3_++;
         }
         buildSubList("Theme",_loc2_);
      }
      
      // the settings list swapped for another: a title and its rows.
      private function buildSubList(param1:String, param2:Array) : void
      {
         if(_mySettings == null)
         {
            return;
         }
         if(_toggleScrollBar)
         {
            _toggleScrollBar.destroy();
            _toggleScrollBar = null;
         }
         if(_toggleWindows)
         {
            if(_toggleWindows.parent)
            {
               _toggleWindows.parent.removeChild(_toggleWindows);
            }
            _toggleWindows.destroy();
            _toggleWindows = null;
         }
         _mySettings.titleTxt.text = param1;
         _toggleWindows = new WindowGenerator();
         // only as many rows as there are things to list: left to fill the
         // window, a short list (a few outfits) got rows with nothing in
         // them, which never finish loading, and nothing was shown.
         _toggleWindows.init(1,_visibleRows,param2.length,0,4,0,ItemWindowToggle,param2,null,null,{"onClose":onClose},null,false,false);
         _mySettings.itemWindow.addChild(_toggleWindows);
         _toggleScrollBar = new SBScrollbar();
         _toggleScrollBar.init(_toggleWindows,_listWidth,_listHeight,2,"scrollbar2",_toggleWindows.boxHeight + 4);
      }
      
      // "Outfits" and "Den layouts": what the player saved (also with the
      // !outfit and !den chat commands), asked of the server, then a row
      // for each with a row on top that saves what is there now.
      private function showSavedList(param1:String) : void
      {
         _savedKind = param1;
         var _loc2_:URLLoader = new URLLoader();
         _loc2_.addEventListener("complete",onSavedList,false,0,false);
         _loc2_.addEventListener("ioError",onSavedFailed,false,0,false);
         _loc2_.addEventListener("securityError",onSavedFailed,false,0,false);
         _loc2_.load(new URLRequest(gMainFrame.clientInfo.websiteURL + "api/saved?username=" + encodeURIComponent(gMainFrame.server.userName) + "&token=" + encodeURIComponent(gMainFrame.clientInfo.authToken)));
      }
      
      private function onSavedFailed(param1:Event) : void
      {
      }
      
      private function onSavedList(param1:Event) : void
      {
         var _loc2_:Boolean = _savedKind == "outfits";
         var _loc3_:Array = [];
         var _loc4_:Array = null;
         var _loc5_:int = 0;
         try
         {
            _loc4_ = JSON.parse(param1.target.data)[_savedKind] as Array;
         }
         catch(e:Error)
         {
            _loc4_ = null;
         }
         if(_loc4_ == null)
         {
            return;
         }
         _loc3_.push({
            "type":TOGGLE_TYPE_JOIN,
            "frame":"commandPick",
            "iconFrame":(_loc2_ ? "nameBadge" : "house"),
            "labelLabel":(_loc2_ ? "What I wear now" : "This den as it is"),
            "btnLabel":"Save",
            "command":(_loc2_ ? "!outfit savenew" : "!den savenew")
         });
         if(_loc2_)
         {
            _loc3_.push({
               "type":TOGGLE_TYPE_JOIN,
               "frame":"commandPick",
               "iconFrame":"nameBadge",
               "labelLabel":"Everything off",
               "btnLabel":"Do it",
               "command":"!outfit off"
            });
            _loc3_.push({
               "type":TOGGLE_TYPE_JOIN,
               "frame":"commandPick",
               "iconFrame":"nameBadge",
               "labelLabel":"What I wore before",
               "btnLabel":"Undo",
               "command":"!outfit undo"
            });
         }
         else
         {
            _loc3_.push({
               "type":TOGGLE_TYPE_JOIN,
               "frame":"commandPick",
               "iconFrame":"house",
               "labelLabel":"Before Clear Den",
               "btnLabel":"Undo",
               "command":"!den undo"
            });
         }
         while(_loc5_ < _loc4_.length)
         {
            _loc3_.push({
               "type":TOGGLE_TYPE_JOIN,
               "frame":"commandPick",
               "iconFrame":(_loc2_ ? "nameBadge" : "house"),
               "labelLabel":String(_loc4_[_loc5_]),
               "btnLabel":(_loc2_ ? "Wear" : "Load"),
               "command":(_loc2_ ? "!outfit wear " : "!den load ") + _loc4_[_loc5_]
            });
            _loc5_++;
         }
         buildSubList(_loc2_ ? "Outfits" : "Den layouts",_loc3_);
      }
      
      private function onPopup(param1:MouseEvent) : void
      {
         param1.stopPropagation();
      }
      
      private function onClose(param1:MouseEvent) : void
      {
         if(param1)
         {
            param1.stopPropagation();
         }
         if(_closeCallback != null)
         {
            _closeCallback();
         }
         else
         {
            destroy();
         }
      }
      
      private function onJoinBtn(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         var _loc3_:String = gMainFrame.clientInfo.websiteURL + "membership";
         var _loc2_:URLRequest = new URLRequest(_loc3_);
         try
         {
            navigateToURL(_loc2_,"_blank");
         }
         catch(e:Error)
         {
         }
      }
      
      private function addEventListeners() : void
      {
         with(_mySettings)
         {
            addEventListener(MouseEvent.MOUSE_DOWN,onPopup,false,0,true);
            bx.addEventListener(MouseEvent.MOUSE_DOWN,onClose,false,0,true);
         }
      }
      
      private function removeEventListeners() : void
      {
         with(_mySettings)
         {
            removeEventListener(MouseEvent.MOUSE_DOWN,onPopup);
            bx.removeEventListener(MouseEvent.MOUSE_DOWN,onClose);
            if(joinBtn)
            {
               joinBtn.removeEventListener(MouseEvent.MOUSE_DOWN,onJoinBtn);
            }
         }
      }
   }
}

