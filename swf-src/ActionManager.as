package gui
{
   import avatar.Avatar;
   import avatar.AvatarManager;
   import avatar.UserCommXtCommManager;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.MouseEvent;
   import flash.geom.Rectangle;
   import flash.utils.Dictionary;
   import game.ArtStudioKit;
   import pet.WorldPet;
   
   // the actions window. an animal has the art for its own set of actions
   // only (a land animal's sitting, sleeping, hopping; an ocean animal's
   // diving, swirling, posing), so it is shown its own set in any room: a
   // land animal underwater still sits and hops. an animal of land and ocean
   // both (seal, otter...) has both, and a button above the window swaps the
   // set shown ("Swim moves" on land, "Land moves" underwater).
   //
   // the sets share buttons, and ":dance:" and ":play:" are the same name in
   // both (the room picks the animation, AvatarWorldView.setAction): the
   // other set's dance and play go by names of their own (OTHER_SET_NAMES).
   // the other names (":dive:", ":sitNW:"...) are one set's already.
   public class ActionManager
   {
      
      private static const OTHER_SET_NAMES:Object = {
         "danceAnim_btnCont":[":danceLand:",":danceSwim:"],
         "playAnim_btnCont":[":playLand:",":playSwim:"]
      };
      
      private static const OTHER_SET_BUTTONS:Object = {
         ":danceLand:":"danceAnim_btnCont",
         ":danceSwim:":"danceAnim_btnCont",
         ":playLand:":"playAnim_btnCont",
         ":playSwim:":"playAnim_btnCont"
      };
      
      private static const SWAP_W:int = 150;
      
      private static const SWAP_H:int = 26;
      
      // the set the window shows: the room's, unless swapped
      private var _oceanShown:Boolean;
      
      // action sprites made from a name (matchActionString), and that name
      private var _names:Dictionary = new Dictionary(true);
      
      private var _swapBtn:MovieClip;

      // Whether the next (and currently selected) action is horizontally
      // mirrored. The state is sent with the action to other players.
      public var mirrorActions:Boolean = false;

      private var _lastAction:Sprite;

      // sitting facing forward (":sitS:", AvatarWorldView's animation 1): the
      // "Forward" in the middle of the four arrows. its action sprite is a
      // class of the client's own (SitForwardAction), not of the HUD's art.
      private static const SIT_FORWARD:String = "SitForwardAction";
      

      private const ACTIONWINDOW_DIM_ALPHA:Number = 0.5;
      
      private const ACTIONWINDOW_BRIGHT_ALPHA:Number = 1;
      
      public var actionBtn:MovieClip;
      
      public var actionWindow:MovieClip;
      
      public var emoteBtn:MovieClip;
      
      public var emoteWindow:Sprite;
      
      public var safeChatBtn:MovieClip;
      
      public var safeChatTree:MovieClip;
      
      public var setActionCallback:Function;
      
      public var actionSprites:Array = ["sit1BtnCont","sit2BtnCont","sit3BtnCont","sit4BtnCont","danceAnim_btnCont","sleepAnim_btnCont","hopAnim_btnCont","playAnim_btnCont","pose1BtnCont","pose2BtnCont","diveAnim_btnCont","swirlAnim_btnCont"];
      
      public var actionStrings:Object;
      
      private var _actions:MovieClip;
      
      private var _petActions:MovieClip;
      
      private var _views:Array;
      
      private var _titleBanner:Sprite;
      
      public function ActionManager(param1:Function, param2:MovieClip, param3:MovieClip, param4:MovieClip, param5:Sprite, param6:MovieClip, param7:MovieClip)
      {
         super();
         if(setActionCallback != null)
         {
            throw new Error("ERROR: Singleton ActionManager did not expect to be created twice!");
         }
         setActionCallback = param1;
         actionBtn = param2;
         actionBtn.addEventListener("mouseDown",actionBtnDownHandler,false,0,true);
         actionWindow = param3;
         addAllActions();
         addSwapButton();
         actionWindow.addChild(_actions);
         actionWindow.addChild(_petActions);
         _petActions.visible = false;
         actionWindow.poseBtns = _actions.poseBtns;
         actionWindow.diveBtn = _actions.diveBtn;
         actionWindow.swirlBtn = _actions.swirlBtn;
         actionWindow.sitBtns = _actions.sitBtns;
         actionWindow.visible = false;
         emoteBtn = param4;
         emoteWindow = param5;
         safeChatBtn = param6;
         safeChatTree = param7;
         setupTitleBanner();
      }
      
      // a room joined: its set is shown, if the animal has it.
      public function turnOnOceanActions(param1:Boolean) : void
      {
         _oceanShown = ownSet(param1);
         showSet();
      }
      
      // the set to show in a room (true: the ocean's): the room's, unless the
      // player's animal has the art of the other only.
      private static function ownSet(param1:Boolean) : Boolean
      {
         var _loc2_:Avatar = AvatarManager.playerAvatar;
         if(_loc2_ == null)
         {
            return param1;
         }
         var _loc3_:Boolean = Utility.isLand(_loc2_.enviroTypeFlag);
         var _loc4_:Boolean = Utility.isOcean(_loc2_.enviroTypeFlag);
         return _loc3_ == _loc4_ ? param1 : _loc4_;
      }
      
      // whether the player's animal has the art of a set (true: the ocean's)
      private static function playerHasSet(param1:Boolean) : Boolean
      {
         var _loc2_:Avatar = AvatarManager.playerAvatar;
         if(_loc2_ == null)
         {
            return false;
         }
         return param1 ? Utility.isOcean(_loc2_.enviroTypeFlag) : Utility.isLand(_loc2_.enviroTypeFlag);
      }
      
      private function showSet() : void
      {
         actionWindow.poseBtns.visible = _oceanShown;
         actionWindow.diveBtn.visible = _oceanShown;
         actionWindow.swirlBtn.visible = _oceanShown;
         actionWindow.sitBtns.visible = !_oceanShown;
         if(_swapBtn)
         {
            ArtStudioKit.setLabel(_swapBtn,_oceanShown ? "Land moves" : "Swim moves");
         }
      }
      
      private function addSwapButton() : void
      {
         _swapBtn = ArtStudioKit.button(null,null,SWAP_W,SWAP_H,onSwapBtn,"Swim moves");
         // the window closes on a press anywhere else
         _swapBtn.addEventListener("mouseDown",stopPress,false,0,true);
         _swapBtn.visible = false;
         _actions.addChild(_swapBtn);
      }
      
      private function stopPress(param1:MouseEvent) : void
      {
         param1.stopPropagation();
      }
      
      private function onSwapBtn(param1:MouseEvent) : void
      {
         _oceanShown = !_oceanShown;
         showSet();
      }
      
      private static function roomIsOcean() : Boolean
      {
         return AvatarManager.roomEnviroType == 1;
      }
      
      // whether the player's animal has the art of both sets
      private static function playerHasBothSets() : Boolean
      {
         var _loc1_:Avatar = AvatarManager.playerAvatar;
         return _loc1_ != null && Utility.isLand(_loc1_.enviroTypeFlag) && Utility.isOcean(_loc1_.enviroTypeFlag);
      }
      
      // the swap button, for an animal of both sets, above the window; any
      // other is shown its own set (the player may have changed animals
      // since the room was joined).
      private function updateSwapButton() : void
      {
         var _loc1_:Boolean = playerHasBothSets();
         var _loc2_:Rectangle = null;
         if(!_loc1_ && _oceanShown != ownSet(roomIsOcean()))
         {
            _oceanShown = ownSet(roomIsOcean());
            showSet();
         }
         _swapBtn.visible = _loc1_;
         if(_loc1_)
         {
            _loc2_ = actionWindow.ba.getBounds(actionWindow);
            if(_titleBanner && actionWindow.contains(_titleBanner))
            {
               _loc2_ = _loc2_.union(_titleBanner.getBounds(actionWindow));
            }
            _swapBtn.x = int(_loc2_.x + (_loc2_.width - SWAP_W) / 2);
            _swapBtn.y = int(_loc2_.top - SWAP_H - 4);
         }
      }
      
      public function turnOnPetActions(param1:Boolean) : void
      {
         if(param1)
         {
            _petActions.visible = true;
            _actions.visible = false;
         }
         else
         {
            _petActions.visible = false;
            _actions.visible = true;
         }
      }
      
      public function reload(param1:MovieClip, param2:MovieClip, param3:MovieClip, param4:Sprite, param5:MovieClip, param6:MovieClip, param7:Function) : void
      {
         setActionCallback = param7;
         if(actionBtn)
         {
            actionBtn.removeEventListener("mouseDown",actionBtnDownHandler);
         }
         actionBtn = param1;
         actionBtn.addEventListener("mouseDown",actionBtnDownHandler,false,0,true);
         while(actionWindow.numChildren > 2)
         {
            actionWindow.removeChildAt(actionWindow.numChildren - 1);
         }
         actionWindow = param2;
         addAllActions();
         addSwapButton();
         actionWindow.addChild(_actions);
         actionWindow.addChild(_petActions);
         _petActions.visible = false;
         actionWindow.poseBtns = _actions.poseBtns;
         actionWindow.diveBtn = _actions.diveBtn;
         actionWindow.swirlBtn = _actions.swirlBtn;
         actionWindow.sitBtns = _actions.sitBtns;
         actionWindow.visible = false;
         emoteBtn = param3;
         emoteWindow = param4;
         actionWindow = param2;
         safeChatBtn = param5;
         safeChatTree = param6;
         actionBtn.downToUpState();
         setupTitleBanner();
      }
      
      private function addAllActions() : void
      {
         var _loc14_:* = 0;
         _loc14_ = 10;
         var _loc11_:* = 0;
         _loc11_ = 25;
         var _loc13_:* = 0;
         _loc13_ = 40;
         var _loc5_:* = 0;
         _loc5_ = 91;
         var _loc2_:* = 0;
         _loc2_ = 2;
         var _loc1_:Number = NaN;
         _loc1_ = -72;
         var _loc4_:Number = NaN;
         _loc4_ = -50;
         var _loc10_:Number = NaN;
         _loc10_ = -88;
         var _loc15_:int = 0;
         _loc15_ = 4;
         var _loc16_:int = 0;
         _loc16_ = 2;
         var _loc7_:int = 0;
         _loc7_ = 8;
         var _loc6_:* = 0;
         var _loc3_:Sprite = null;
         var _loc12_:Sprite = null;
         var _loc8_:int = 0;
         var _loc9_:int = 0;
         _actions = new MovieClip();
         _petActions = new MovieClip();
         _loc6_ = 0;
         while(_loc6_ < actionSprites.length)
         {
            if(_loc6_ < 8)
            {
               _loc3_ = GETDEFINITIONBYNAME(_loc6_ < 4 ? "sitBtns" : actionSprites[_loc6_]);
               if(_loc6_ == 0)
               {
                  _loc3_.x = actionWindow.ba.width * 0.5 + -72 - 25 - 5;
                  _loc3_.y = 10 + Math.floor(_loc6_ / 2) * 40 + -50;
                  _actions.addChild(_loc3_);
                  _actions.sitBtns = _loc3_;
                  _loc8_ = 1;
                  while(_loc8_ <= 4)
                  {
                     _loc12_ = _loc3_["sit" + _loc8_ + "Btn"];
                     _loc12_.buttonMode = true;
                     _loc12_.useHandCursor = true;
                     _loc12_.tabEnabled = true;
                     _loc12_.tabChildren = false;
                     _loc12_.addEventListener("mouseDown",actionClickHandler,false,0,true);
                     _loc8_++;
                  }
                  addSitDirectionButtons(_loc3_);
               }
               else if(_loc6_ >= 4)
               {
                  _loc3_.x = 25 + (_loc6_ % 2 * 91 + -72);
                  _loc3_.y = 10 + Math.floor(_loc6_ / 2) * 40 + -88;
                  _actions.addChild(_loc3_);
                  _loc3_.buttonMode = true;
                  _loc3_.useHandCursor = true;
                  _loc3_.tabEnabled = true;
                  _loc3_.tabChildren = false;
                  _loc3_.addEventListener("mouseDown",actionClickHandler,false,0,true);
               }
            }
            else
            {
               _loc3_ = GETDEFINITIONBYNAME(_loc6_ == 8 ? "poseBtns" : actionSprites[_loc6_]);
               if(_loc6_ == 8)
               {
                  _loc3_.visible = false;
                  _actions.poseBtns = _loc3_;
                  _loc3_.x = actionWindow.ba.width * 0.5 + -72 - 25 - 5;
                  _loc3_.y = 10 + Math.floor((_loc6_ - 8) / 2) * 40 + -50;
                  _actions.addChild(_loc3_);
                  _loc9_ = 1;
                  while(_loc9_ <= 2)
                  {
                     _loc12_ = _loc3_["pose" + _loc9_ + "Btn"];
                     _loc12_.buttonMode = true;
                     _loc12_.useHandCursor = true;
                     _loc12_.tabEnabled = true;
                     _loc12_.tabChildren = false;
                     _loc12_.addEventListener("mouseDown",actionClickHandler,false,0,true);
                     _loc9_++;
                  }
               }
               else if(_loc6_ >= 8 + 2)
               {
                  _loc3_.visible = false;
                  if(_loc6_ == actionSprites.length - 1)
                  {
                     _actions.diveBtn = _loc3_;
                  }
                  else
                  {
                     _actions.swirlBtn = _loc3_;
                  }
                  _loc3_.x = 25 + ((_loc6_ - 5) % 2 * 91 + -72);
                  _loc3_.y = 10 + Math.floor((_loc6_ - 5) / 2) * 40 + -88;
                  _actions.addChild(_loc3_);
                  _loc3_.buttonMode = true;
                  _loc3_.useHandCursor = true;
                  _loc3_.tabEnabled = true;
                  _loc3_.tabChildren = false;
                  _loc3_.addEventListener("mouseDown",actionClickHandler,false,0,true);
               }
            }
            _loc6_++;
         }
         _loc3_ = GETDEFINITIONBYNAME("playPetAnim_btnCont");
         _loc3_.y = -31;
         _loc3_.buttonMode = true;
         _loc3_.useHandCursor = true;
         _loc3_.tabEnabled = true;
         _loc3_.tabChildren = false;
         _loc3_.addEventListener("mouseDown",onPetPlayBtn,false,0,true);
         _petActions.addChild(_loc3_);
         _loc3_ = GETDEFINITIONBYNAME("dancePetAnim_btnCont");
         _petActions.danceBtn = _loc3_;
         _loc3_.y = 31;
         _loc3_.buttonMode = true;
         _loc3_.useHandCursor = true;
         _loc3_.tabEnabled = true;
         _loc3_.tabChildren = false;
         _loc3_.addEventListener("mouseDown",actionClickHandler,false,0,true);
         _petActions.addChild(_loc3_);
         actionStrings = {};
         actionStrings["sit1BtnCont"] = actionStrings["pose1BtnCont"] = [":sitNW:",":poseLeft:"];
         actionStrings["sit2BtnCont"] = [":sitNE:"];
         actionStrings["sit3BtnCont"] = [":sitSE:"];
         actionStrings["sit4BtnCont"] = actionStrings["pose2BtnCont"] = [":sitSW:",":poseRight:"];
         actionStrings["danceAnim_btnCont"] = actionStrings["dancePetAnim_btnCont"] = [":dance:"];
         actionStrings["sleepAnim_btnCont"] = actionStrings["diveAnim_btnCont"] = [":sleep:",":dive:"];
         actionStrings["hopAnim_btnCont"] = actionStrings["swirlAnim_btnCont"] = [":hop:",":swirl:"];
         actionStrings["playAnim_btnCont"] = [":play:"];
         actionStrings[SIT_FORWARD] = [":sitS:"];
      }
      
      private function setupTitleBanner() : void
      {
         if(emoteWindow.name.indexOf("Quest") == -1)
         {
            if(_titleBanner)
            {
               if(!actionWindow.contains(_titleBanner))
               {
                  actionWindow.addChild(_titleBanner);
               }
            }
            else
            {
               _titleBanner = GETDEFINITIONBYNAME("AnimsTitleBanner");
               _titleBanner.x = -91.75;
               _titleBanner.y = -91.25;
               actionWindow.addChild(_titleBanner);
            }
         }
      }
      
      public function destroy() : void
      {
         setActionCallback = null;
         actionBtn.removeEventListener("mouseDown",actionBtnDownHandler);
         actionBtn = null;
         actionWindow.visible = false;
         actionWindow = null;
         emoteBtn = null;
         emoteWindow = null;
         safeChatBtn = null;
         safeChatTree = null;
      }
      
      // the name a button sends: the set shown's, and for dance and play the
      // other set's own name when the set shown is not the room's.
      private function nameFor(param1:String) : String
      {
         var _loc2_:Array = actionStrings[param1];
         if(!_loc2_)
         {
            return null;
         }
         if(OTHER_SET_NAMES[param1] && _oceanShown != roomIsOcean())
         {
            return OTHER_SET_NAMES[param1][_oceanShown ? 1 : 0];
         }
         return _loc2_.length > 1 ? _loc2_[_oceanShown ? 1 : 0] : _loc2_[0];
      }
      
      // Front and Back sit facing straight forward and straight away. Mirror
      // replays whichever action was picked most recently in the other
      // horizontal direction (including dance, sleep, hop and play).
      private function addSitDirectionButtons(param1:MovieClip) : void
      {
         var _loc2_:Rectangle = param1.getBounds(param1);
         var _loc3_:Number = _loc2_.x + _loc2_.width * 0.5;
         var _loc4_:Number = _loc2_.y + _loc2_.height * 0.5;
         var _loc5_:Sprite = addDirectionButton(param1,"Front",0,0,false);
         var _loc6_:Sprite = addDirectionButton(param1,"Back",0,0,true);
         var _loc7_:Number = _loc3_ - (_loc5_.width + 3 + _loc6_.width) * 0.5;
         _loc5_.x = _loc7_;
         _loc6_.x = _loc7_ + _loc5_.width + 3;
         _loc5_.y = _loc6_.y = _loc4_ - 13;
         var _loc8_:Sprite = actionPill("Mirror");
         var _loc9_:Sprite = actionHitTarget(_loc8_);
         _loc9_.x = _loc3_ - _loc9_.width * 0.5;
         _loc9_.y = _loc4_ + 3;
         _loc9_.addEventListener("mouseDown",mirrorClickHandler,false,0,true);
         _loc9_.addEventListener("mouseOver",function(param1:MouseEvent):void
         {
            _loc9_.alpha = 0.8;
         },false,0,true);
         _loc9_.addEventListener("mouseOut",function(param1:MouseEvent):void
         {
            _loc9_.alpha = 1;
         },false,0,true);
         param1.addChild(_loc9_);
      }

      private function addDirectionButton(param1:MovieClip, param2:String, param3:Number, param4:Number, param5:Boolean) : Sprite
      {
         var _loc6_:Sprite = actionPill(param2);
         var _loc7_:Sprite = actionHitTarget(_loc6_);
         _loc7_.x = param3;
         _loc7_.y = param4;
         _loc7_.name = param5 ? "sitBackHit" : "sitFrontHit";
         _loc7_.addEventListener("mouseDown",sitDirectionClickHandler,false,0,true);
         param1.addChild(_loc7_);
         return _loc7_;
      }

      // Keep the generated controls visually uniform. Invisible trailing
      // spaces reserve the same room without changing the labels players see.
      private function actionPill(param1:String) : Sprite
      {
         var _loc2_:String = param1 == "Front" ? "Front " : (param1 == "Back" ? "Back  " : param1);
         return AJClient.makePill(_loc2_,0x5CB82E,0x2C6E16,false,10);
      }

      private function sitDirectionClickHandler(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         // one sprite class for both; each sprite is named for the way it faces
         var _loc2_:Sprite = new SitForwardAction();
         _names[_loc2_] = param1.currentTarget.name == "sitBackHit" ? ":sitN:" : ":sitS:";
         selectAction(_loc2_);
      }

      // The sit artwork is itself a MovieClip with mouse children. A separate
      // transparent hit target above it keeps our generated labels clickable.
      private function actionHitTarget(param1:Sprite) : Sprite
      {
         var _loc2_:Sprite = new Sprite();
         _loc2_.graphics.beginFill(0,0);
         _loc2_.graphics.drawRect(0,0,param1.width,param1.height);
         _loc2_.graphics.endFill();
         _loc2_.addChild(param1);
         _loc2_.buttonMode = true;
         _loc2_.useHandCursor = true;
         _loc2_.mouseEnabled = true;
         _loc2_.mouseChildren = false;
         return _loc2_;
      }

      private function selectAction(param1:Sprite, param2:Boolean = false) : void
      {
         if(!actionBtn.isGray)
         {
            mirrorActions = param2;
            _lastAction = param1;
            setActionCallback(param1);
            actionBtn.dispatchEvent(new MouseEvent("mouseDown"));
         }
      }

      private function mirrorClickHandler(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(!actionBtn.isGray)
         {
            mirrorActions = !mirrorActions;
            if(_lastAction)
            {
               setActionCallback(_lastAction);
            }
         }
      }

      public function rememberAction(param1:Sprite) : void
      {
         _lastAction = param1;
      }

      public function getActionString(param1:Sprite) : String
      {
         if(_names[param1] != undefined)
         {
            return _names[param1];
         }
         var _loc2_:String = param1["constructor"].toString();
         return nameFor(_loc2_.slice(7,_loc2_.length - 1));
      }
      
      // the button for an action's name, which it then stands for. `typed`:
      // the player's own, typed in chat, which is held to the sets their
      // animal has art for; another player's is taken as it came
      // (AvatarWorldView.setAction plays what their animal has art for).
      public function matchActionString(param1:String, param2:Boolean = false) : Sprite
      {
         var _loc3_:int = 0;
         if(param1 == ":sitS:" || param1 == ":sitN:")
         {
            var _loc9_:Sprite = new SitForwardAction();
            _names[_loc9_] = param1;
            return _loc9_;
         }
         var _loc4_:String = OTHER_SET_BUTTONS[param1];
         var _loc5_:Sprite = null;
         if(_loc4_ && param2 && !playerHasSet(param1.indexOf("Swim") != -1))
         {
            return null;
         }
         if(!_loc4_)
         {
            for each(var _loc2_:String in actionSprites)
            {
               _loc3_ = int(actionStrings[_loc2_].indexOf(param1));
               if(_loc3_ != -1)
               {
                  if(actionStrings[_loc2_].length <= 1 || !param2 || playerHasSet(_loc3_ == 1))
                  {
                     _loc4_ = _loc2_;
                     break;
                  }
               }
            }
         }
         if(!_loc4_)
         {
            return null;
         }
         _loc5_ = GETDEFINITIONBYNAME(_loc4_);
         _names[_loc5_] = param1;
         return _loc5_;
      }
      
      public function openActions() : void
      {
         if(!actionWindow.visible)
         {
            updateSwapButton();
            actionWindow.visible = true;
            brightenActions();
         }
      }
      
      public function dimActions() : void
      {
         if(actionWindow.visible && actionWindow.alpha != 0.5)
         {
            actionWindow.alpha = 0.5;
         }
      }
      
      public function brightenActions() : void
      {
         if(actionWindow.alpha != 1)
         {
            actionWindow.alpha = 1;
         }
      }
      
      public function closeActions() : void
      {
         if(actionWindow.visible)
         {
            actionWindow.visible = false;
            brightenActions();
            actionBtn.downToUpState();
         }
      }
      
      public function grayOutPetDanceBtn(param1:Boolean) : void
      {
         if(_petActions)
         {
            _petActions.danceBtn.activateGrayState(param1);
         }
      }
      
      private function actionBtnDownHandler(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(!param1.currentTarget.isGray)
         {
            if(actionWindow.visible)
            {
               closeActions();
            }
            else
            {
               if(safeChatTree.visible)
               {
                  safeChatBtn.dispatchEvent(param1);
               }
               if(emoteWindow.visible)
               {
                  emoteBtn.dispatchEvent(param1);
               }
               openActions();
            }
         }
      }
      
      private function actionClickHandler(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(!actionBtn.isGray && !param1.currentTarget.isGray)
         {
            _lastAction = new param1.currentTarget.constructor();
            setActionCallback(_lastAction);
            actionBtn.dispatchEvent(new MouseEvent("mouseDown"));
            param1.currentTarget.downToUpState();
         }
      }
      
      private function onPetPlayBtn(param1:MouseEvent) : void
      {
         var _loc2_:WorldPet = null;
         param1.stopPropagation();
         if(AvatarManager.playerAvatarWorldView)
         {
            _loc2_ = AvatarManager.playerAvatarWorldView.getActivePet();
            if(_loc2_)
            {
               AvatarManager.playerAvatarWorldView.faceAnim(0,0,false);
               _loc2_.onClick(param1);
            }
         }
         actionBtn.dispatchEvent(new MouseEvent("mouseDown"));
         param1.currentTarget.downToUpState();
      }
   }
}

