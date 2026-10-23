package
{
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.filters.ColorMatrixFilter;
   import flash.geom.Rectangle;
   import flash.net.URLRequest;
   import flash.system.ApplicationDomain;
   import flash.system.LoaderContext;

   // the web item giver's den item preview (public/item-preview.html): one
   // den item's art, as a den shows it. flashvars: art (its address),
   // version (the variant) and tint ("rrggbb") with strength (1 to 100), as
   // DenItemHelper gives them.
   public class PreviewHost extends MovieClip
   {
      private static const MARGIN:Number = 10;

      private var _loader:Loader;

      public function PreviewHost()
      {
         super();
         stage.scaleMode = "noScale";
         stage.align = "TL";
         _loader = new Loader();
         _loader.contentLoaderInfo.addEventListener("complete",onLoaded);
         _loader.contentLoaderInfo.addEventListener("ioError",onFailed);
         addChild(_loader);
         var _loc1_:String = loaderInfo.parameters.art;
         if(_loc1_)
         {
            _loader.load(new URLRequest(_loc1_),new LoaderContext(false,new ApplicationDomain()));
         }
      }

      private function onLoaded(param1:Event) : void
      {
         var _loc2_:Object = _loader.content;
         var _loc3_:int = int(loaderInfo.parameters.version);
         if(_loc2_.hasOwnProperty("setVersion"))
         {
            _loc2_.setVersion(_loc3_);
         }
         var _loc4_:String = loaderInfo.parameters.tint;
         if(_loc4_)
         {
            _loader.filters = [new ColorMatrixFilter(tintMatrix(uint(parseInt(_loc4_,16)),Math.max(1,Math.min(100,Number(loaderInfo.parameters.strength) || 100)) / 100))];
         }
         addEventListener("enterFrame",fit);
      }

      private function onFailed(param1:IOErrorEvent) : void
      {
      }

      // fitted to the stage, centred: kept on as an item may grow as it plays.
      private function fit(param1:Event) : void
      {
         _loader.scaleX = _loader.scaleY = 1;
         _loader.x = _loader.y = 0;
         var _loc2_:Rectangle = _loader.getBounds(this);
         if(_loc2_.width <= 0 || _loc2_.height <= 0)
         {
            return;
         }
         var _loc3_:Number = Math.min((stage.stageWidth - MARGIN * 2) / _loc2_.width,(stage.stageHeight - MARGIN * 2) / _loc2_.height);
         _loader.scaleX = _loader.scaleY = _loc3_;
         _loader.x = (stage.stageWidth - _loc2_.width * _loc3_) / 2 - _loc2_.x * _loc3_;
         _loader.y = (stage.stageHeight - _loc2_.height * _loc3_) / 2 - _loc2_.y * _loc3_;
      }

      // DenItemHelper.tintMatrix's
      private static function tintMatrix(param1:uint, param2:Number) : Array
      {
         var _loc3_:Array = [(param1 >> 16 & 0xFF) / 255,(param1 >> 8 & 0xFF) / 255,(param1 & 0xFF) / 255];
         var _loc4_:Number = 0.299 * _loc3_[0] + 0.587 * _loc3_[1] + 0.114 * _loc3_[2];
         var _loc5_:Number = Math.min(2,1 / Math.max(0.001,_loc4_));
         var _loc6_:Array = [];
         var _loc7_:int = 0;
         while(_loc7_ < 3)
         {
            var _loc8_:Number = _loc3_[_loc7_] * _loc5_ * param2;
            _loc6_.push(0.299 * _loc8_ + (_loc7_ == 0 ? 1 - param2 : 0),0.587 * _loc8_ + (_loc7_ == 1 ? 1 - param2 : 0),0.114 * _loc8_ + (_loc7_ == 2 ? 1 - param2 : 0),0,0);
            _loc7_++;
         }
         _loc6_.push(0,0,0,1,0);
         return _loc6_;
      }
   }
}
