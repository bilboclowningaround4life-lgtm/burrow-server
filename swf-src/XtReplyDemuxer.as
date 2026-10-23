package
{
   import com.sbi.client.SFEvent;
   import avatar.NPCView;
   import buddy.BuddyCard;
   import com.sbi.graphics.PaletteHelper;
   import flash.events.TimerEvent;
   import flash.utils.Timer;
   import flash.utils.getTimer;
   import gui.itemWindows.ItemWindowToggle;
   
   public class XtReplyDemuxer
   {
      
      private static var MSG_DELAY_MS:int = 0;
      
      private static var _delayList:Array;
      
      private static var _delayTimer:Timer;
      
      private static var _xtReplyCallbacks:Vector.<Function>;
      
      private static var _xtReplyCommands:Vector.<String>;
      
      public function XtReplyDemuxer()
      {
         super();
      }
      
      public static function init() : void
      {
         if(MSG_DELAY_MS > 0)
         {
            _delayList = [];
            _delayTimer = new Timer(10);
            _delayTimer.addEventListener("timer",delayTimerHandler,false,0,true);
            _delayTimer.start();
         }
         _xtReplyCallbacks = new Vector.<Function>();
         _xtReplyCommands = new Vector.<String>();
         gMainFrame.server.addEventListener("OnXtReply",xtReplyHandler,false,0,true);
      }
      
      public static function destroy() : void
      {
         _delayList = null;
         if(_delayTimer)
         {
            if(_delayTimer.running)
            {
               _delayTimer.stop();
            }
            _delayTimer = null;
         }
         _xtReplyCallbacks = null;
         _xtReplyCommands = null;
         gMainFrame.server.removeEventListener("OnXtReply",xtReplyHandler);
      }
      
      public static function addModule(param1:Function, param2:String) : void
      {
         _xtReplyCallbacks.push(param1);
         _xtReplyCommands.push(param2);
      }
      
      public static function removeModule(param1:Function) : void
      {
         var _loc2_:int = _xtReplyCallbacks.indexOf(param1);
         if(_loc2_ >= 0)
         {
            _xtReplyCallbacks.splice(_loc2_,1);
            _xtReplyCommands.splice(_loc2_,1);
            return;
         }
         throw new Error("module not found! callback:" + param1);
      }
      
      public static function xtReplyHandler(param1:SFEvent) : void
      {
         var _loc3_:String = null;
         var _loc4_:int = 0;
         var _loc2_:Function = null;
         if(param1.obj[0] == "xcc")
         {
            PaletteHelper.handleCustomColors(param1.obj);
            return;
         }
         if(param1.obj[0] == "xsp")
         {
            AJClient.onStaff(param1.obj);
            return;
         }
         if(param1.obj[0] == "xtv")
         {
            AJClient.onTheatreVideo(param1.obj);
            return;
         }
         if(param1.obj[0] == "xui")
         {
            AJClient.onStaffUi(param1.obj);
            return;
         }
         if(param1.obj[0] == "xdi")
         {
            AJClient.onItemDefs(param1.obj);
            return;
         }
         if(param1.obj[0] == "xtl")
         {
            AJClient.showMessage(param1.obj);
            return;
         }
         if(param1.obj[0] == "xyn")
         {
            AJClient.askYesNo(param1.obj);
            return;
         }
         if(param1.obj[0] == "xgt")
         {
            AJClient.onStaffGoto(param1.obj);
            return;
         }
         if(param1.obj[0] == "xcm")
         {
            AJClient.onItemMaker(param1.obj);
            return;
         }
         if(param1.obj[0] == "xiv")
         {
            AJClient.onInvisible(param1.obj);
            return;
         }
         if(param1.obj[0] == "xmn")
         {
            AJClient.onMentions(param1.obj);
            return;
         }
         if(param1.obj[0] == "xtr")
         {
            AJClient.onTrading(param1.obj);
            return;
         }
         if(param1.obj[0] == "xty")
         {
            AJClient.onTyping(param1.obj);
            return;
         }
         if(param1.obj[0] == "xw")
         {
            AJClient.onWhisper(param1.obj);
            return;
         }
         if(param1.obj[0] == "xrn")
         {
            AJClient.onRenamed(param1.obj);
            return;
         }
         if(param1.obj[0] == "xls")
         {
            AJClient.noteLastSeen(param1.obj);
            return;
         }
         if(param1.obj[0] == "xfl")
         {
            AJClient.onFilterState(param1.obj);
            return;
         }
         if(param1.obj[0] == "xcs")
         {
            ItemWindowToggle.chatStyleState(param1.obj);
            return;
         }
         if(param1.obj[0] == "xfa")
         {
            AJClient.onFilterAsk(param1.obj);
            return;
         }
         // the player's chat filter (AJClient.filterText), on what other
         // players wrote, before any of the game sees it. A chat line
         // ([.., room, who, text, type, ..], typed chat being types 0 and
         // 9) that is to be left out is simply not passed on.
         try
         {
            if(param1.obj[0] == "uc" && (int(param1.obj[4]) == 0 || int(param1.obj[4]) == 9) && int(param1.obj[2]) != gMainFrame.server.userId)
            {
               _loc3_ = AJClient.filterText(String(param1.obj[3]));
               if(_loc3_ == null)
               {
                  AJClient.whisperNext = false;
                  return;
               }
               param1.obj[3] = _loc3_;
            }
            // Jam-A-Grams: one pushed ("ep", 17 fields from the third), or
            // the inbox ("el": a count, then 17 fields a card). the words
            // are a card's sixth field and who sent it (0 a player) its
            // fourteenth.
            else if(param1.obj[0] == "ep" && param1.obj.length >= 19 && int(param1.obj[15]) == 0)
            {
               param1.obj[7] = AJClient.filterOrNote(String(param1.obj[7]));
            }
            else if(param1.obj[0] == "el")
            {
               _loc4_ = 3;
               while(_loc4_ + 16 < param1.obj.length)
               {
                  if(int(param1.obj[_loc4_ + 13]) == 0)
                  {
                     param1.obj[_loc4_ + 5] = AJClient.filterOrNote(String(param1.obj[_loc4_ + 5]));
                  }
                  _loc4_ += 17;
               }
            }
            // A player's bio, the last field of what their card is told:
            // their own too, so they see it as others do.
            else if(param1.obj[0] == "xbn" && param1.obj.length > 7)
            {
               param1.obj[7] = AJClient.filterOrNote(String(param1.obj[7]));
            }
         }
         catch(e:Error)
         {
            GlobalErrorCatch.reportToServer("chat filter: " + e + "\n" + e.getStackTrace());
         }
         if(param1.obj[0] == "xbn")
         {
            BuddyCard.onBanInfo(param1.obj);
            return;
         }
         _loc4_ = 0;
         while(_loc4_ < _xtReplyCommands.length)
         {
            _loc3_ = _xtReplyCommands[_loc4_];
            if(_loc3_.charAt(0) == param1.obj[0].charAt(0))
            {
               if(_loc3_.length == 1)
               {
                  _loc2_ = _xtReplyCallbacks[_loc4_];
                  break;
               }
               if(param1.obj[0].indexOf(_loc3_) != -1)
               {
                  _loc2_ = _xtReplyCallbacks[_loc4_];
                  break;
               }
            }
            _loc4_++;
         }
         if(_loc2_ == null)
         {
            throw new Error("ERROR: undefined module command:" + param1.obj[0]);
         }
         if(MSG_DELAY_MS == 0)
         {
            NPCView.disguiseDefId = param1.obj[0] == "dph" ? int(param1.obj[5]) : 0;
            try
            {
               _loc2_(param1);
            }
            catch(e:Error)
            {
               NPCView.disguiseDefId = 0;
               GlobalErrorCatch.reportToServer("while handling server message \"" + param1.obj[0] + "\": " + e + "\n" + e.getStackTrace());
               // not thrown on: the global catch only reported it a second time
            }
            NPCView.disguiseDefId = 0;
         }
         else
         {
            _delayList.push({
               "f":_loc2_,
               "e":param1,
               "ts":getTimer() + MSG_DELAY_MS
            });
         }
      }
      
      private static function delayTimerHandler(param1:TimerEvent) : void
      {
         var _loc4_:Object = null;
         var _loc2_:int = 0;
         var _loc3_:uint = uint(getTimer());
         _loc2_ = 0;
         while(_loc2_ < _delayList.length)
         {
            _loc4_ = _delayList[_loc2_];
            if(_loc4_.ts >= _loc3_)
            {
               break;
            }
            _loc4_.f(_loc4_.e);
            _delayList.splice(0,1);
            _loc2_--;
            _loc2_++;
         }
      }
   }
}

