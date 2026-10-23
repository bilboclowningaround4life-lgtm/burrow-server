package gui
{
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.MovieClip;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.display.GradientType;
   import flash.display.SpreadMethod;
   import flash.events.MouseEvent;
   import flash.events.TextEvent;
   import flash.filters.ConvolutionFilter;
   import flash.geom.ColorTransform;
   import flash.geom.Point;
   import flash.geom.Rectangle;
   import flash.geom.Matrix;
   import flash.text.TextField;
   import flash.utils.setTimeout;
   import loader.MediaHelper;
   import localization.LocalizationManager;
   
   public dynamic class ChatBalloon extends MovieClip
   {
      
      private const CHAT_TIMEOUT_MS:int = 8000;
      
      private const BALLOON_BEGIN_FADEOUT:Number = 1000;
      
      private const BALLOON_MAX_ALPHA:Number = 0.75;
      
      private const TEXT_COLOR_NORMAL:uint = 4477529;
      
      private const TEXT_COLOR_BAD_TEXT:uint = 13369344;
      
      private var _maxAlpha:Number;
      
      private var _timeout:int = 0;
      
      private var _avType:int = 0;
      
      private var _originalFrameId:int = 0;
      
      private var _originalCustomMsgText:String;
      
      private var _emoteBG:MovieClip = null;
      
      private var _emote:Sprite = null;
      
      private var _permEmoteMediaId:int = -1;
      
      private var _permEmoteMediaHelper:MediaHelper;
      
      private var _hasSbTextfield:Boolean;
      
      private var _msgTxt:Object;
      
      private var _balloonBG:MovieClip;
      
      private var _btnBallonBG:MovieClip;
      
      private var _btnBalloonMouseBG:MovieClip;
      
      private var _btnBalloonUpBG:MovieClip;
      
      private var _btnBalloonDownBg:MovieClip;
      
      private var _btnBalloonGrayBG:MovieClip;
      
      private var _onCustomAdventureBtn:Function;
      
      private var _onCustomPVPBtn:Function;
      
      private var _emoteBGOffsetFunc:Function;
      
      // emotes drawn inside a line of chat, small, where they were typed: an
      // emote's code standing as a word of its own ("hi :) there", ":fever:").
      // a "\" before one keeps it as typed ("\:)" shows ":)"), as it does a
      // ":name:" of an emoji (AJClient.emojiShortcodes). and emoji (typed with Windows'
      // emoji panel, say), which the game's font has none of: each is drawn
      // as a picture of it, from the server (/emoji/<code points>.png,
      // Twemoji's). each is {at, clip}: where its gap starts in the text shown.
      // Four spaces reserve a full inline cell. placeInline() scales wide
      // artwork to this measured slot with a one-pixel gutter on each side,
      // so consecutive emoji neither overlap nor touch surrounding text.
      private static const INLINE_GAP:String = "    ";

      // after each gap: a gap ending the text was trailing spaces, which a
      // centred line leaves out, so the text sat off centre and its last
      // emoji past it. this is no space, and has no width.
      private static const INLINE_END:String = "\u200B";
      
      private static const LONGEST_EMOTE_CODE:int = 16;
      
      private var _inline:Array = [];

      // The server appends this compact style to spoken chat packets.  It is
      // deliberately drawn over the stock balloon rather than requiring new
      // artwork, so every combination of the account-page colour controls is
      // available at once.
      private var _styleFill:Sprite;
      private var _styleMask:Bitmap;
      private var _styleBorderLayer:Bitmap;
      private var _styleBackground:uint;
      private var _styleAccent:uint;
      private var _styleText:uint;
      private var _styleBorder:uint;
      private var _styleOpacity:Number;
      private var _styleAnimation:String = "none";
      private var _styleSpeed:Number = 100;
      private var _styleGradient:String = "linear";
      private var _styleAngle:Number = 45;
      private var _styleStrength:Number = 100;
      private var _styleOutline:Number = 1;
      private var _styleStops:Array = [];
      private var _styleElapsed:int = 0;
      private var _hasStyle:Boolean = false;
      
      public function ChatBalloon()
      {
         super();
      }
      
      public function init(param1:int, param2:Function, param3:Boolean = false, param4:int = 1, param5:Number = 1, param6:Class = null, param7:Function = null, param8:Function = null) : void
      {
         if(param5 < 0.75)
         {
            this.scaleX = this.scaleY = 1 + (0.75 - param5);
         }
         _originalFrameId = param4;
         this.gotoAndStop(param4);
         _balloonBG = this["balloon_bg"];
         _msgTxt = this["message_txt"];
         _onCustomAdventureBtn = param7;
         _onCustomPVPBtn = param8;
         _emoteBGOffsetFunc = param2;
         _avType = param1;
         visible = false;
         _msgTxt.autoSize = "center";
         if(param3)
         {
            _maxAlpha = 1;
         }
         else
         {
            _maxAlpha = 0.75;
         }
         _emoteBG = GETDEFINITIONBYNAME("emo_bubble");
         setEmoteBgOffsets();
      }
      
      public function setText(param1:String, param2:Boolean = false, param3:Boolean = true, param4:String = "") : void
      {
         if(_emote)
         {
            _permEmoteMediaId = -1;
            _emoteBG.itemWindow.removeChild(_emote);
            _emote = null;
         }
         if(contains(_emoteBG))
         {
            removeChild(_emoteBG);
         }
         if(param1 != _msgTxt.text && _hasSbTextfield)
         {
            _balloonBG.visible = false;
            setAlpha(_maxAlpha);
            this.visible = false;
         }
         else
         {
            _balloonBG.visible = true;
            setAlpha(_maxAlpha);
            this.visible = true;
         }
         clearInline();
         clearMentionBacks();
         _msgTxt.text = inlineEmotes(param1);
         _msgTxt.height;
         // AJClient.whisperNext is set by the server's "xw" just ahead of a
         // whispered line.
         var _loc10_:Boolean = AJClient.whisperNext;
         _balloonBG.transform.colorTransform = _loc10_ ? AJClient.whisperTint() : new ColorTransform();
         AJClient.whisperNext = false;
         if(!_hasSbTextfield)
         {
            if(param3)
            {
               _balloonBG.m.height = Math.ceil(_msgTxt.height);
               _balloonBG.m.y = _balloonBG.b.y - _balloonBG.m.height;
               _balloonBG.t.y = _balloonBG.m.y - _balloonBG.t.height;
               _msgTxt.y = -_balloonBG.b.height - _balloonBG.m.height;
            }
            else
            {
               _balloonBG.m.height = Math.ceil(_msgTxt.height);
               _balloonBG.b.y = _balloonBG.m.y + _balloonBG.m.height;
               _msgTxt.y = _balloonBG.t.height + 3;
            }
            if(this.currentFrameLabel == "advBtn")
            {
               _btnBallonBG.y = _balloonBG.y + _balloonBG.t.y - _btnBallonBG.height + _balloonBG.t.height;
            }
         }
         if(param2)
         {
            _msgTxt.textColor = 13369344;
         }
         else
         {
            _msgTxt.textColor = 4477529;
         }
         // Emoji-window choices are inline chat content, so even a lone one
         // keeps the selected chat style. Standalone game emotes use
         // setEmote(), where any previous custom bubble is cleared.
         applyStyle(param4,param2,_loc10_);
         // tags (AJClient.resolveMentions): once the server says which "@"s
         // are players', light blue and underlined, each a link to that
         // player's card, if the balloon still says the same. (the field is
         // another on some frames.)
         if(!param2 && _msgTxt is TextField && _msgTxt.text.indexOf("@") != -1)
         {
            var field:TextField = TextField(_msgTxt);
            var shown:String = field.text;
            field.addEventListener("link",onMentionLink,false,0,true);
            field.addEventListener("mouseDown",onMentionMouse,false,0,true);
            field.addEventListener("mouseUp",onMentionMouse,false,0,true);
            AJClient.resolveMentions(shown,function(param1:Array):void
            {
               if(field.text == shown)
               {
                  // in the message's own colour here: the blue box marks it
                  AJClient.styleMentions(field,param1,true,4477529);
                  // and their backgrounds, now and once laid out for sure
                  AJClient.drawMentionBacks(field,param1,AJClient.MENTION_BACK_LIGHT);
                  setTimeout(function():void
                  {
                     if(field.text == shown)
                     {
                        AJClient.drawMentionBacks(field,param1,AJClient.MENTION_BACK_LIGHT);
                     }
                  },42);
               }
            });
         }
         // The stock balloon has now stretched to the measured text height;
         // redraw the custom body at its final size (also for still styles).
         if(_hasStyle)
         {
            drawStyle();
         }
         _timeout = 8000;
         if(param3 && this.parent)
         {
            this.parent.addChild(this);
         }
         if(_inline.length > 0)
         {
            // now, and once more when the text has been laid out for sure
            // (the game's own inline emotes, in SBTextField, wait a frame).
            placeInline();
            setTimeout(placeInline,42);
         }
      }

      // `background,accent,text,border,opacity,animation,speed,gradient,angle,
      // strength,outline,stops`, emitted by
      // lib/chatstyles.js. Staff warnings and whispers intentionally retain
      // their existing colours, so those states are never made ambiguous.
      private function applyStyle(param1:String, param2:Boolean, param3:Boolean) : void
      {
         clearStyle();
         if(param1 == "" || param2 || param3 || !GuiManager.customChatBubblesEnabled())
         {
            return;
         }
         var _loc4_:Array = param1.split(",");
         if((_loc4_.length != 7 && _loc4_.length != 10 && _loc4_.length != 11 && _loc4_.length != 12) || !/^[0-9a-fA-F]{6}$/.test(_loc4_[0]) || !/^[0-9a-fA-F]{6}$/.test(_loc4_[1]) || !/^[0-9a-fA-F]{6}$/.test(_loc4_[2]) || !/^[0-9a-fA-F]{6}$/.test(_loc4_[3]) || !/^(?:2[5-9]|[3-9][0-9]|100)$/.test(_loc4_[4]) || !/^(?:[4-9][0-9]|[12][0-9]{2}|300)$/.test(_loc4_[6]))
         {
            return;
         }
         _styleBackground = uint(parseInt(_loc4_[0],16));
         _styleAccent = uint(parseInt(_loc4_[1],16));
         _styleText = uint(parseInt(_loc4_[2],16));
         _styleBorder = uint(parseInt(_loc4_[3],16));
         _styleOpacity = Math.max(0.25,Math.min(1,Number(_loc4_[4]) / 100));
         _styleAnimation = GuiManager.chatBubbleAnimationsEnabled() && (_loc4_[5] == "pulse" || _loc4_[5] == "shimmer" || _loc4_[5] == "flow" || _loc4_[5] == "rainbow") ? _loc4_[5] : "none";
         _styleSpeed = Math.max(40,Math.min(300,Number(_loc4_[6])));
         _styleGradient = _loc4_.length > 7 && (_loc4_[7] == "solid" || _loc4_[7] == "radial") ? _loc4_[7] : "linear";
         _styleAngle = _loc4_.length > 8 && int(_loc4_[8]) >= 0 && int(_loc4_[8]) <= 315 && int(_loc4_[8]) % 45 == 0 ? int(_loc4_[8]) : 45;
         _styleStrength = _loc4_.length > 9 ? Math.max(0,Math.min(100,int(_loc4_[9]))) : 100;
         _styleOutline = _loc4_.length > 10 ? Math.max(0,Math.min(4,int(_loc4_[10]))) : 1;
         _styleStops = parseStyleStops(_loc4_.length > 11 ? String(_loc4_[11]) : "");
         _styleElapsed = 0;
         _hasStyle = true;
         _msgTxt.textColor = _styleText;
         // The native artwork remains underneath as the exact outer border;
         // drawStyle masks the custom fill to that artwork's silhouette.
         _balloonBG.transform.colorTransform = colourTransform(_styleBorder,1);
      }

      private function clearStyle() : void
      {
         if(_styleFill)
         {
            _styleFill.mask = null;
         }
         if(_styleFill && _styleFill.parent)
         {
            _styleFill.parent.removeChild(_styleFill);
         }
         if(_styleMask)
         {
            if(_styleMask.parent)
            {
               _styleMask.parent.removeChild(_styleMask);
            }
            if(_styleMask.bitmapData)
            {
               _styleMask.bitmapData.dispose();
            }
         }
         if(_styleBorderLayer)
         {
            if(_styleBorderLayer.parent)
            {
               _styleBorderLayer.parent.removeChild(_styleBorderLayer);
            }
            if(_styleBorderLayer.bitmapData)
            {
               _styleBorderLayer.bitmapData.dispose();
            }
         }
         _styleFill = null;
         _styleMask = null;
         _styleBorderLayer = null;
         _styleAnimation = "none";
         _styleGradient = "linear";
         _styleStops = [];
         _hasStyle = false;
      }

      private static function colourTransform(param1:uint, param2:Number) : ColorTransform
      {
         return new ColorTransform(0,0,0,param2,param1 >> 16 & 255,param1 >> 8 & 255,param1 & 255,0);
      }

      private static function blendColour(param1:uint, param2:uint, param3:Number) : uint
      {
         var _loc4_:Number = 1 - param3;
         var _loc5_:uint = uint((param1 >> 16 & 255) * _loc4_ + (param2 >> 16 & 255) * param3);
         var _loc6_:uint = uint((param1 >> 8 & 255) * _loc4_ + (param2 >> 8 & 255) * param3);
         var _loc7_:uint = uint((param1 & 255) * _loc4_ + (param2 & 255) * param3);
         return _loc5_ << 16 | _loc6_ << 8 | _loc7_;
      }

      private static function rainbowColour(param1:Number) : uint
      {
         var _loc2_:int = int(param1 * 6) % 6;
         var _loc3_:Number = param1 * 6 - int(param1 * 6);
         var _loc4_:uint = uint(255 * _loc3_);
         var _loc5_:uint = 255 - _loc4_;
         if(_loc2_ == 0)
         {
            return 0xFF0000 | _loc4_ << 8;
         }
         if(_loc2_ == 1)
         {
            return _loc5_ << 16 | 0xFF00;
         }
         if(_loc2_ == 2)
         {
            return 0x00FF00 | _loc4_;
         }
         if(_loc2_ == 3)
         {
            return _loc5_ << 8 | 0xFF;
         }
         if(_loc2_ == 4)
         {
            return _loc4_ << 16 | 0xFF;
         }
         return 0xFF0000 | _loc5_ << 8;
      }

      private function parseStyleStops(param1:String) : Array
      {
         var _loc1_:Array = [];
         var _loc2_:Array = String(param1 || "").split(";");
         var _loc3_:int = 0;
         var _loc4_:Array = null;
         var _loc5_:int = -1;
         while(_loc3_ < _loc2_.length && _loc2_.length >= 2 && _loc2_.length <= 5)
         {
            _loc4_ = String(_loc2_[_loc3_]).split(":");
            if(_loc4_.length != 2 || !/^[0-9a-fA-F]{6}$/.test(String(_loc4_[0])) || !/^100$|^[1-9]?\d$/.test(String(_loc4_[1])) || int(_loc4_[1]) <= _loc5_)
            {
               _loc1_ = [];
               break;
            }
            _loc5_ = int(_loc4_[1]);
            _loc1_.push({"color":uint(parseInt(_loc4_[0],16)),"position":_loc5_});
            _loc3_++;
         }
         if(_loc1_.length < 2 || int(_loc1_[0].position) != 0 || int(_loc1_[_loc1_.length - 1].position) != 100)
         {
            _loc1_ = [{"color":_styleBackground,"position":0},{"color":_styleAccent,"position":100}];
         }
         return _loc1_;
      }

      private function drawStyle() : void
      {
         if(!_hasStyle || !_balloonBG || !_msgTxt)
         {
            return;
         }
         if(_styleFill == null)
         {
            _styleFill = new Sprite();
            _styleFill.mouseEnabled = false;
            _styleFill.mouseChildren = false;
            // Flash uses a Bitmap mask's alpha channel only when both sides
            // are cached. Without this it masks to the bitmap's rectangle.
            _styleFill.cacheAsBitmap = true;
            // The stock background contains masks and nested timeline layers.
            // Put this beside it, directly below the text, so those masks
            // cannot hide custom colours or animated gradients.
            var _loc8_:DisplayObject = _msgTxt as DisplayObject;
            while(_loc8_ && _loc8_.parent != this)
            {
               _loc8_ = _loc8_.parent;
            }
            if(_loc8_ && _loc8_.parent == this)
            {
               addChildAt(_styleFill,getChildIndex(_loc8_));
            }
            else
            {
               addChildAt(_styleFill,Math.min(numChildren,getChildIndex(_balloonBG) + 1));
            }
         }
         var _loc9_:Rectangle = _balloonBG.getBounds(this);
         if(_styleMask == null)
         {
            // Snapshot only the native bubble's alpha and use it as a mask.
            // Eroding that silhouette by the chosen outline width leaves the
            // tinted native artwork visible as an even border, including the
            // speech tail. A rounded-rectangle inset cannot match that shape.
            var _loc10_:BitmapData = new BitmapData(Math.max(1,Math.ceil(_loc9_.width)),Math.max(1,Math.ceil(_loc9_.height)),true,0);
            var _loc11_:Matrix = _balloonBG.transform.matrix.clone();
            _loc11_.translate(-_loc9_.x,-_loc9_.y);
            _loc10_.draw(_balloonBG,_loc11_,null,null,null,true);
            var _loc20_:BitmapData = new BitmapData(_loc10_.width,_loc10_.height,true,0);
            _loc20_.threshold(_loc10_,_loc10_.rect,new Point(),">",0x08000000,0xFFFFFFFF,0xFF000000,false);
            _loc10_.dispose();
            var _loc32_:BitmapData = _loc20_.clone();
            if(_styleOutline > 0)
            {
               var _loc21_:int = int(_styleOutline) * 2 + 1;
               var _loc22_:Array = [];
               var _loc23_:int = 0;
               var _loc24_:int = 0;
               var _loc25_:int = 0;
               while(_loc24_ < _loc21_)
               {
                  _loc25_ = 0;
                  while(_loc25_ < _loc21_)
                  {
                     if(Math.abs(_loc24_ - int(_styleOutline)) + Math.abs(_loc25_ - int(_styleOutline)) <= _styleOutline)
                     {
                        _loc22_.push(1);
                        _loc23_++;
                     }
                     else
                     {
                        _loc22_.push(0);
                     }
                     _loc25_++;
                  }
                  _loc24_++;
               }
               var _loc26_:BitmapData = new BitmapData(_loc20_.width,_loc20_.height,true,0);
               // Outside the snapshot must be transparent. Clamping repeats
               // opaque edge pixels and prevents the top/side of the mask
               // from shrinking, which made thick outlines appear only at
               // the lower edge and corners.
               _loc26_.applyFilter(_loc20_,_loc20_.rect,new Point(),new ConvolutionFilter(_loc21_,_loc21_,_loc22_,_loc23_,0,false,false,0,0));
               _loc20_.fillRect(_loc20_.rect,0);
               _loc20_.threshold(_loc26_,_loc26_.rect,new Point(),">",0xFE000000,0xFFFFFFFF,0xFF000000,false);
               _loc26_.dispose();
               // Keep only the pixels removed from the inner mask. This is a
               // solid, even ring and does not inherit the stock art's uneven
               // border opacity.
               _loc32_.threshold(_loc20_,_loc20_.rect,new Point(),">",0x00000000,0x00000000,0xFF000000,false);
               _loc32_.colorTransform(_loc32_.rect,colourTransform(_styleBorder,1));
               _styleBorderLayer = new Bitmap(_loc32_,"auto",true);
               _styleBorderLayer.x = _loc9_.x;
               _styleBorderLayer.y = _loc9_.y;
               _styleBorderLayer.cacheAsBitmap = true;
               addChildAt(_styleBorderLayer,getChildIndex(_styleFill));
            }
            else
            {
               _loc32_.dispose();
            }
            _styleMask = new Bitmap(_loc20_,"auto",true);
            _styleMask.x = _loc9_.x;
            _styleMask.y = _loc9_.y;
            _styleMask.cacheAsBitmap = true;
            addChildAt(_styleMask,getChildIndex(_styleFill));
            _styleFill.mask = _styleMask;
         }
         var _loc1_:Number = _loc9_.x;
         var _loc2_:Number = _loc9_.y;
         var _loc3_:Number = Math.max(12,_loc9_.width);
         var _loc4_:Number = Math.max(12,_loc9_.height);
         var _loc5_:Number = (_styleElapsed * _styleSpeed / 100000) % 1;
         var _loc27_:Array = [];
         var _loc28_:Array = [];
         var _loc29_:Array = [];
         var _loc30_:int = 0;
         var _loc31_:uint = 0;
         while(_loc30_ < _styleStops.length)
         {
            _loc31_ = uint(_styleStops[_loc30_].color);
            if(_loc30_ > 0)
            {
               _loc31_ = blendColour(_styleBackground,_loc31_,_styleStrength / 100);
            }
            if(_styleAnimation == "shimmer")
            {
               _loc31_ = blendColour(_loc31_,_styleBackground,(Math.sin(_loc5_ * Math.PI * 2) + 1) * 0.5);
            }
            _loc27_.push(_loc31_);
            _loc28_.push(_styleOpacity);
            _loc29_.push(int(Number(_styleStops[_loc30_].position) * 2.55));
            _loc30_++;
         }
         _styleFill.graphics.clear();
         var _loc7_:Matrix = new Matrix();
         var _loc12_:Number = _styleAngle * Math.PI / 180;
         var _loc13_:String = _styleGradient == "radial" ? GradientType.RADIAL : GradientType.LINEAR;
         _loc7_.createGradientBox(_loc3_,_loc4_,_loc12_,_loc1_,_loc2_);
         if(_styleGradient == "solid" && _styleAnimation != "rainbow")
         {
            _styleFill.graphics.beginFill(_styleBackground,_styleOpacity);
         }
         else if(_styleAnimation == "flow")
         {
            _loc7_.createGradientBox(_loc3_ * 0.75,_loc4_ * 0.75,_loc12_,_loc1_ + Math.cos(_loc12_) * (_loc5_ * 2 - 1) * _loc3_,_loc2_ + Math.sin(_loc12_) * (_loc5_ * 2 - 1) * _loc4_);
            _styleFill.graphics.beginGradientFill(_loc13_,_loc27_,_loc28_,_loc29_,_loc7_,SpreadMethod.REFLECT);
         }
         else if(_styleAnimation == "rainbow" && _styleGradient == "solid")
         {
            _styleFill.graphics.beginFill(rainbowColour(_loc5_),_styleOpacity);
         }
         else if(_styleAnimation == "rainbow")
         {
            _styleFill.graphics.beginGradientFill(_loc13_,[rainbowColour(_loc5_),rainbowColour((_loc5_ + 0.18) % 1),rainbowColour((_loc5_ + 0.36) % 1)],[_styleOpacity,_styleOpacity,_styleOpacity],[0,128,255],_loc7_);
         }
         else
         {
            _styleFill.graphics.beginGradientFill(_loc13_,_loc27_,_loc28_,_loc29_,_loc7_);
         }
         _styleFill.graphics.drawRect(_loc1_,_loc2_,_loc3_,_loc4_);
         _styleFill.graphics.endFill();
         _styleFill.alpha = _styleAnimation == "pulse" ? 0.55 + 0.45 * (Math.sin(_loc5_ * Math.PI * 2) + 1) * 0.5 : 1;
      }
      
      // the text with each emote code and emoji (above) replaced by a gap, the
      // picture for it kept in _inline. what is neither stays as typed.
      private function inlineEmotes(param1:String) : String
      {
         var _loc2_:String = "";
         var _loc3_:int = 0;
         var _loc5_:String = null;
         var _loc7_:Sprite = null;
         var _loc8_:int = 0;
         while(_loc3_ < param1.length)
         {
            _loc8_ = emojiLength(param1,_loc3_);
            if(_loc8_ > 0)
            {
               _inline.push({
                  "at":_loc2_.length,
                  "clip":emojiClip(param1.substr(_loc3_,_loc8_))
               });
               _loc2_ += INLINE_GAP + INLINE_END;
               _loc3_ += _loc8_;
               continue;
            }
            _loc5_ = null;
            // an emoji as it is sent: "\{1f600}" (AJClient.emojiToTokens)
            if(param1.substr(_loc3_,2) == "\\{")
            {
               var _loc9_:Array = /^\\\{([0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,9})\}/.exec(param1.substr(_loc3_,90));
               if(_loc9_ != null)
               {
                  _inline.push({
                     "at":_loc2_.length,
                     "clip":emojiClipNamed(_loc9_[1])
                  });
                  _loc2_ += INLINE_GAP + INLINE_END;
                  _loc3_ += String(_loc9_[0]).length;
                  continue;
               }
            }
            if(param1.charAt(_loc3_) == "\\")
            {
               // "\" and an emote's code, or ":name:": that, as typed
               _loc5_ = emoteCodeAt(param1,_loc3_ + 1,false);
               var _loc10_:Array = /^:[a-z0-9_]{1,30}:/.exec(param1.substr(_loc3_ + 1,32));
               if(_loc5_ == null && _loc10_ != null)
               {
                  _loc5_ = _loc10_[0];
               }
               if(_loc5_ != null)
               {
                  _loc2_ += _loc5_;
                  _loc3_ += 1 + _loc5_.length;
                  continue;
               }
            }
            else if(_loc3_ == 0 || param1.charAt(_loc3_ - 1) == " ")
            {
               _loc5_ = emoteCodeAt(param1,_loc3_,true);
            }
            _loc7_ = _loc5_ == null ? null : EmoticonUtility.getSmallSmileyMCForEmoteString(_loc5_);
            if(_loc7_ != null)
            {
               _loc7_.mouseEnabled = false;
               _loc7_.mouseChildren = false;
               _inline.push({
                  "at":_loc2_.length,
                  "clip":_loc7_
               });
               _loc2_ += INLINE_GAP + INLINE_END;
               _loc3_ += _loc5_.length;
            }
            else
            {
               _loc2_ += param1.charAt(_loc3_);
               _loc3_++;
            }
         }
         return _loc2_;
      }

      // the longest emote code at `param2`, or null. `param3`: as a word of its
      // own, so it must end the text or come before a space or a stop.
      private static function emoteCodeAt(param1:String, param2:int, param3:Boolean) : String
      {
         var _loc4_:int = Math.min(LONGEST_EMOTE_CODE,param1.length - param2);
         var _loc5_:String = null;
         var _loc6_:String = null;
         while(_loc4_ >= 2)
         {
            _loc5_ = param1.substr(param2,_loc4_);
            _loc6_ = param1.charAt(param2 + _loc4_);
            if((!param3 || _loc6_ == "" || " .,!?".indexOf(_loc6_) != -1) && EmoticonUtility.doesStringMatchAnEmote(_loc5_))
            {
               return _loc5_;
            }
            _loc4_--;
         }
         return null;
      }

      // how many UTF-16 units the emoji at `param2` takes (with its skin tone,
      // its variation selector, a keycap, a second flag letter, and whatever
      // it is joined to with a zero-width joiner), or 0 when there is none.
      public static function emojiLength(param1:String, param2:int) : int
      {
         var _loc3_:int = param1.charCodeAt(param2);
         var _loc4_:int = 0;
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         var _loc7_:Boolean = false;
         if(_loc3_ >= 0xD800 && _loc3_ <= 0xDBFF)
         {
            _loc5_ = codePointAt(param1,param2);
            if(_loc5_ < 0x1F000 || _loc5_ > 0x1FAFF)
            {
               return 0;
            }
            _loc4_ = 2;
            _loc7_ = _loc5_ >= 0x1F1E6 && _loc5_ <= 0x1F1FF;
            // a flag is two letters
            if(_loc7_)
            {
               _loc6_ = codePointAt(param1,param2 + 2);
               if(_loc6_ >= 0x1F1E6 && _loc6_ <= 0x1F1FF)
               {
                  _loc4_ = 4;
               }
            }
         }
         else if(_loc3_ >= 0x2600 && _loc3_ <= 0x27BF || _loc3_ >= 0x2300 && _loc3_ <= 0x23FF || _loc3_ >= 0x2B00 && _loc3_ <= 0x2BFF
            || _loc3_ >= 0x2194 && _loc3_ <= 0x21AA || _loc3_ >= 0x25AA && _loc3_ <= 0x25FE
            || [0x203C,0x2049,0x2122,0x2139,0x24C2,0x2934,0x2935,0x3030,0x303D,0x3297,0x3299,0xA9,0xAE].indexOf(_loc3_) != -1 && param1.charCodeAt(param2 + 1) == 0xFE0F)
         {
            _loc4_ = 1;
         }
         else if("0123456789#*".indexOf(param1.charAt(param2)) != -1 && param1.charCodeAt(param2 + 1) == 0xFE0F && param1.charCodeAt(param2 + 2) == 0x20E3)
         {
            return 3;
         }
         else
         {
            return 0;
         }
         while(param2 + _loc4_ < param1.length)
         {
            _loc3_ = param1.charCodeAt(param2 + _loc4_);
            if(_loc3_ == 0xFE0F || _loc3_ == 0x20E3)
            {
               _loc4_++;
            }
            else if(_loc3_ == 0xD83C && param1.charCodeAt(param2 + _loc4_ + 1) >= 0xDFFB && param1.charCodeAt(param2 + _loc4_ + 1) <= 0xDFFF)
            {
               _loc4_ += 2;
            }
            else if(_loc3_ == 0x200D && param2 + _loc4_ + 1 < param1.length)
            {
               _loc5_ = emojiLength(param1,param2 + _loc4_ + 1);
               if(_loc5_ == 0)
               {
                  break;
               }
               _loc4_ += 1 + _loc5_;
               break;
            }
            else
            {
               break;
            }
         }
         return _loc4_;
      }

      private static function codePointAt(param1:String, param2:int) : int
      {
         var _loc3_:int = param1.charCodeAt(param2);
         var _loc4_:int = param1.charCodeAt(param2 + 1);
         if(_loc3_ >= 0xD800 && _loc3_ <= 0xDBFF && _loc4_ >= 0xDC00 && _loc4_ <= 0xDFFF)
         {
            return (_loc3_ - 0xD800) * 0x400 + (_loc4_ - 0xDC00) + 0x10000;
         }
         return _loc3_;
      }

      // its picture's name, as Twemoji names its files: the code points in
      // hex, "-" between, without U+FE0F unless it is joined (U+200D).
      public static function emojiName(param1:String) : String
      {
         var _loc2_:Array = [];
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         var _loc5_:Boolean = param1.indexOf(String.fromCharCode(0x200D)) != -1;
         while(_loc3_ < param1.length)
         {
            _loc4_ = codePointAt(param1,_loc3_);
            _loc3_ += _loc4_ > 0xFFFF ? 2 : 1;
            if(_loc4_ != 0xFE0F || _loc5_)
            {
               _loc2_.push(_loc4_.toString(16));
            }
         }
         return _loc2_.join("-");
      }

      // the picture of an emoji: a 72-square, its middle on the origin (as
      // the game's small emotes are), filled when the picture has loaded.
      private static function emojiClip(param1:String) : Sprite
      {
         return emojiClipNamed(emojiName(param1));
      }

      private static function emojiClipNamed(param1:String) : Sprite
      {
         var _loc2_:Sprite = new Sprite();
         _loc2_.graphics.beginFill(0,0);
         _loc2_.graphics.drawRect(-36,-36,72,72);
         _loc2_.graphics.endFill();
         _loc2_.mouseEnabled = false;
         _loc2_.mouseChildren = false;
         AJClient.loadArt(gMainFrame.clientInfo.websiteURL + "emoji/" + param1 + ".png",_loc2_,72,false);
         return _loc2_;
      }

      // puts each inline emote over its gap, as tall as the line.
      private function placeInline() : void
      {
         var _loc1_:Object = null;
         var _loc2_:Rectangle = null;
         var _loc3_:Rectangle = null;
         var _loc4_:Number = 0;
         var _loc5_:Number = 1;
         for each(_loc1_ in _inline)
         {
            _loc2_ = _msgTxt.getCharBoundaries(_loc1_.at);
            _loc3_ = _msgTxt.getCharBoundaries(_loc1_.at + INLINE_GAP.length - 1);
            if(_loc2_ == null)
            {
               _loc2_ = _loc3_;
            }
            if(_loc3_ == null || _loc2_ != null && _loc3_.y != _loc2_.y)
            {
               _loc3_ = _loc2_;
            }
            if(_loc2_ != null)
            {
               _loc1_.clip.scaleX = _loc1_.clip.scaleY = 1;
               _loc1_.clip.height = _loc2_.height;
               _loc1_.clip.scaleX = _loc1_.clip.scaleY;
               _loc4_ = Math.max(1,_loc3_.x + _loc3_.width - _loc2_.x - 2);
               if(_loc1_.clip.width > _loc4_)
               {
                  _loc5_ = _loc4_ / _loc1_.clip.width;
                  _loc1_.clip.scaleX *= _loc5_;
                  _loc1_.clip.scaleY *= _loc5_;
               }
               _loc1_.clip.x = _msgTxt.x + (_loc2_.x + _loc3_.x + _loc3_.width) / 2;
               _loc1_.clip.y = _msgTxt.y + _loc2_.y + _loc2_.height / 2;
               if(_loc1_.clip.parent != this)
               {
                  addChild(_loc1_.clip);
               }
            }
         }
      }
      
      private function clearInline() : void
      {
         var _loc1_:Object = null;
         for each(_loc1_ in _inline)
         {
            if(_loc1_.clip.parent == this)
            {
               removeChild(_loc1_.clip);
            }
         }
         _inline = [];
      }
      
      public function setCustomAdventureMessage(param1:String, param2:String, param3:int, param4:Boolean = false, param5:Boolean = false) : void
      {
         clearMentionBacks();
         var _loc6_:int = 0;
         var _loc7_:int = 0;
         var _loc8_:Array = param2.split("|");
         if(param5)
         {
            param2 = _loc8_[0];
            _loc6_ = int(_loc8_[1]);
         }
         else
         {
            param2 = _loc8_[0];
            _loc7_ = int(_loc8_[1]);
         }
         if(param2 == "on")
         {
            if(_emote && _emoteBG)
            {
               _emoteBG.itemWindow.removeChild(_emote);
               _emote = null;
               if(contains(_emoteBG))
               {
                  removeChild(_emoteBG);
               }
            }
            if(this.currentFrameLabel != "advBtn")
            {
               this.gotoAndStop("advBtn");
            }
            _balloonBG = this["balloon_bg"];
            _btnBallonBG = this["btnBalloon_bg"];
            _btnBalloonMouseBG = _btnBallonBG.mouse.mouse;
            _btnBalloonUpBG = _btnBallonBG.mouse.up;
            _btnBalloonDownBg = _btnBallonBG.down;
            _btnBalloonGrayBG = _btnBallonBG.gray;
            _btnBallonBG.isForPVP = param5;
            _btnBallonBG.PVPGameId = _loc6_;
            _btnBallonBG.scriptDefId = _loc7_;
            _btnBallonBG.addEventListener("mouseDown",onBtnBG,false,0,true);
            _msgTxt = this["message_txt"];
            _msgTxt.autoSize = "center";
            LocalizationManager.translateId(_btnBalloonMouseBG.message_txt,11259);
            LocalizationManager.translateId(_btnBalloonUpBG.message_txt,11259);
            LocalizationManager.translateId(_btnBalloonDownBg.message_txt,11259);
            LocalizationManager.translateId(_btnBalloonGrayBG.message_txt,11259);
            if(param3 > 0)
            {
               _btnBalloonMouseBG.message_txt.x = 3;
               _btnBalloonUpBG.message_txt.x = 3;
               _btnBalloonDownBg.message_txt.x = 3;
               _btnBalloonGrayBG.message_txt.x = 3;
               _btnBallonBG["redDot"].visible = true;
            }
            else
            {
               _btnBalloonMouseBG.message_txt.x = 17;
               _btnBalloonUpBG.message_txt.x = 17;
               _btnBalloonDownBg.message_txt.x = 17;
               _btnBalloonGrayBG.message_txt.x = 17;
               _btnBallonBG["redDot"].visible = false;
            }
            _msgTxt.text = param1;
            _originalCustomMsgText = param1;
            _balloonBG.m.height = _msgTxt.height;
            _balloonBG.m.y = _balloonBG.b.y - _msgTxt.height;
            _balloonBG.t.y = _balloonBG.m.y - _balloonBG.t.height;
            _msgTxt.y = -_balloonBG.b.height - _msgTxt.height;
            _btnBallonBG.y = _balloonBG.y + _balloonBG.t.y - _btnBallonBG.height + _balloonBG.t.height;
            if(this.itemWindow)
            {
               this.itemWindow.y = _btnBallonBG.y;
            }
            _balloonBG.t.alpha = 0;
            setAlpha(_maxAlpha);
            this.visible = true;
            _timeout = 8000;
            if(this.parent)
            {
               this.parent.addChild(this);
            }
         }
         else
         {
            if(_btnBallonBG)
            {
               if(_btnBallonBG.isForPVP != param5)
               {
                  return;
               }
               _btnBallonBG.removeEventListener("mouseDown",onBtnBG);
            }
            if(this.currentFrameLabel == "advBtn")
            {
               this.gotoAndStop(_originalFrameId);
            }
            _balloonBG = this["balloon_bg"];
            _msgTxt = this["message_txt"];
            _msgTxt.autoSize = "center";
            this.visible = false;
         }
      }
      
      public function get msgTxt() : Object
      {
         return _msgTxt;
      }
      
      public function get isPvpCustom() : Boolean
      {
         if(_btnBallonBG)
         {
            return _btnBallonBG.isForPVP;
         }
         return false;
      }
      
      public function get pvpGameId() : int
      {
         if(_btnBallonBG)
         {
            return _btnBallonBG.PVPGameId;
         }
         return 0;
      }
      
      public function setCustomPVPImage(param1:MovieClip) : void
      {
         var _loc2_:Number = NaN;
         if(this.currentFrameLabel == "advBtn")
         {
            while(this.itemWindow.numChildren > 0)
            {
               this.itemWindow.removeChildAt(0);
            }
            param1 = param1.getChildAt(0) as MovieClip;
            param1.gotoAndStop("icon");
            _loc2_ = 32.5 / Math.max(param1.sizeCont.width,param1.sizeCont.height);
            param1.scaleX = param1.scaleY = _loc2_;
            param1.sizeCont.scaleX = param1.sizeCont.scaleY = _loc2_;
            param1.x += param1.sizeCont.width * 0.5;
            param1.y += param1.sizeCont.height * 0.5;
            this.itemWindow.addChild(param1);
         }
      }
      
      // the backgrounds of the tags of the text before (setText)
      private function clearMentionBacks() : void
      {
         if(_msgTxt is TextField)
         {
            AJClient.drawMentionBacks(TextField(_msgTxt),null);
         }
      }

      // a press on a tag goes no further: the room under the balloon would
      // take it for a click on the floor and walk the player there.
      private function onMentionMouse(param1:MouseEvent) : void
      {
         var _loc2_:TextField = param1.currentTarget as TextField;
         var _loc3_:int = _loc2_ != null ? _loc2_.getCharIndexAtPoint(param1.localX,param1.localY) : -1;
         if(_loc3_ >= 0 && _loc2_.getTextFormat(_loc3_,_loc3_ + 1).url)
         {
            param1.stopPropagation();
         }
      }

      // a tag clicked: "@name" (setText)
      private function onMentionLink(param1:TextEvent) : void
      {
         param1.stopPropagation();
         if(param1.text && param1.text.charAt(0) == "@")
         {
            AJClient.openProfile(param1.text.substr(1));
         }
      }

      private function onBtnBG(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         if(param1.currentTarget.isForPVP)
         {
            _onCustomPVPBtn(param1.currentTarget.PVPGameId);
         }
         else
         {
            _onCustomAdventureBtn(param1.currentTarget.scriptDefId);
         }
      }
      
      private function updateCustAdventureBGSize(param1:MovieClip, param2:Object) : void
      {
         _balloonBG.m.height = _msgTxt.height;
         _balloonBG.m.y = _balloonBG.b.y - _msgTxt.height;
         _balloonBG.t.y = _balloonBG.m.y - _balloonBG.t.height;
         _msgTxt.y = -_balloonBG.b.height - _msgTxt.height;
         _btnBallonBG.y = _balloonBG.y + _balloonBG.t.y - _btnBallonBG.height + _balloonBG.t.height;
         if(this.itemWindow)
         {
            this.itemWindow.y = _btnBallonBG.y;
         }
      }
      
      public function setEmote(param1:Sprite, param2:int = -1) : void
      {
         // Native one-emote messages hide balloon_bg. Remove any independent
         // custom fill left by the preceding text message as well.
         clearStyle();
         _balloonBG.transform.colorTransform = new ColorTransform();
         clearMentionBacks();
         if(this.currentFrameLabel != "advBtn")
         {
            _permEmoteMediaId = param2;
            if(_emote)
            {
               _emoteBG.itemWindow.removeChild(_emote);
               _emote = null;
            }
            if(_permEmoteMediaId >= 0)
            {
               param1 = new Sprite();
               _permEmoteMediaHelper = new MediaHelper();
               _permEmoteMediaHelper.init(_permEmoteMediaId,permEmoteMediaCallback);
            }
            if(param1)
            {
               _msgTxt.text = "";
               addChild(_emoteBG);
               _emote = param1;
               _emote.y = -5;
               _emoteBG.itemWindow.addChild(_emote);
               if(_emote is MovieClip)
               {
                  MovieClip(_emote).gotoAndPlay(1);
               }
               if(this.currentFrameLabel != "advBtn")
               {
                  _timeout = 8000;
               }
               _balloonBG.visible = false;
               setAlpha(1);
               _emoteBG.bubble.alpha = _maxAlpha;
               _emoteBG.itemWindow.alpha = 1;
               this.visible = true;
            }
         }
      }
      
      public function setReadyForClear() : void
      {
         if(this.visible && _timeout > 1000)
         {
            _timeout = 1000;
         }
         _permEmoteMediaId = -1;
      }
      
      public function setPos(param1:int, param2:int) : void
      {
         this.x = param1;
         this.y = param2;
      }
      
      public function heartbeat(param1:int) : void
      {
         if(_styleAnimation != "none" && visible)
         {
            _styleElapsed += param1;
            drawStyle();
         }
         if(_timeout && _permEmoteMediaId < 0)
         {
            if(param1 >= _timeout)
            {
               _timeout = 0;
               if(_emote)
               {
                  _emoteBG.itemWindow.removeChild(_emote);
                  _emote = null;
               }
               if(this.currentFrameLabel != "advBtn")
               {
                  this.visible = false;
               }
               else
               {
                  _msgTxt.text = _originalCustomMsgText;
                  updateCustAdventureBGSize(_balloonBG,_msgTxt);
               }
            }
            else
            {
               _timeout -= param1;
               if(this.currentFrameLabel != "advBtn" && _timeout < 1000)
               {
                  setAlpha(_timeout / 1000 * _maxAlpha);
               }
            }
         }
      }
      
      public function set avType(param1:int) : void
      {
         if(param1 != _avType)
         {
            _avType = param1;
            setEmoteBgOffsets();
         }
      }
      
      public function updateEmoteBgOffsets() : void
      {
         setEmoteBgOffsets();
      }
      
      private function setAlpha(param1:Number) : void
      {
         this.alpha = param1;
         _msgTxt.alpha = 1;
      }
      
      private function permEmoteMediaCallback(param1:MovieClip) : void
      {
         var _loc2_:int = 0;
         var _loc4_:Point = null;
         var _loc3_:Number = NaN;
         if(param1 && _emote && _permEmoteMediaId >= 0)
         {
            param1 = param1.getChildAt(0) as MovieClip;
            _loc2_ = 0;
            while(_loc2_ < param1.currentLabels.length)
            {
               if(param1.currentLabels[_loc2_].name == "icon")
               {
                  param1.gotoAndStop("icon");
                  break;
               }
               _loc2_++;
            }
            if("sizeCont" in param1)
            {
               _loc4_ = new Point(param1.sizeCont.width,param1.sizeCont.height);
            }
            else
            {
               _loc4_ = new Point(param1.width,param1.height);
            }
            _loc3_ = 30 / Math.max(_loc4_.x,_loc4_.y);
            param1.scaleX = param1.scaleY = _loc3_;
            if("sizeCont" in param1)
            {
               param1.sizeCont.scaleX = param1.sizeCont.scaleY = _loc3_;
            }
            else
            {
               param1.x -= param1.width * 0.5;
               param1.y -= param1.height * 0.5;
            }
            _emote.addChild(param1);
         }
      }
      
      private function setEmoteBgOffsets() : void
      {
         var _loc1_:Point = _emoteBGOffsetFunc(_avType);
         _emoteBG.x = _loc1_.x;
         _emoteBG.y = _loc1_.y;
      }
   }
}

