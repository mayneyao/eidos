#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>

// One request per process. Production only asks for ownership or writes data;
// inspecting content is restricted to the isolated test pasteboard namespace.
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL isolated = argc == 3 && strcmp(argv[1], "--pasteboard") == 0 &&
                    strncmp(argv[2], "eidos-test-", 11) == 0;
    if (argc != 1 && !isolated) return 2;
    NSPasteboard *board = isolated
      ? [NSPasteboard pasteboardWithName:[NSString stringWithUTF8String:argv[2]]]
      : NSPasteboard.generalPasteboard;
    NSData *input = [NSFileHandle.fileHandleWithStandardInput readDataToEndOfFile];
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:input options:0 error:nil];
    NSMutableDictionary *response = [NSMutableDictionary dictionary];
    NSString *action = request[@"action"];
    if ([action isEqual:@"write"]) {
      NSArray *paths = request[@"paths"];
      if (![paths isKindOfClass:NSArray.class] || paths.count > 10000) return 2;
      NSMutableArray<NSPasteboardItem *> *items = [NSMutableArray array];
      for (NSString *path in paths) {
        if (![path isKindOfClass:NSString.class] || !path.isAbsolutePath) return 2;
        NSURL *url = [NSURL fileURLWithPath:path];
        NSPasteboardItem *item = [NSPasteboardItem new];
        // One file URL per item, preserving multi-file order and Unicode names.
        [item setString:url.absoluteString forType:NSPasteboardTypeFileURL];
        [items addObject:item];
      }
      if (items.count == 0) [items addObject:[NSPasteboardItem new]];
      [items[0] setString:@"copy" forType:@"space.eidos.file-clipboard"];
      // File URLs always refer to the original. Pixel consumers get a full-size
      // representation from the original bytes, never the Explorer thumbnail.
      if (paths.count == 1 && [request[@"image"] isKindOfClass:NSString.class]) {
        NSData *bytes = [[NSData alloc] initWithBase64EncodedString:request[@"image"] options:0];
        CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)bytes, NULL);
        if (source) {
          NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
          double width = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
          double height = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
          // Bound decoding independently of compressed input size.
          if (width > 0 && height > 0 && width * height <= 32000000) {
            NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:bytes];
            if (bitmap && bitmap.pixelsWide == width && bitmap.pixelsHigh == height) {
              BOOL png = CFEqual(CGImageSourceGetType(source), CFSTR("public.png"));
              NSData *pngBytes = png ? bytes : [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
              NSData *tiff = [bitmap representationUsingType:NSBitmapImageFileTypeTIFF properties:@{}];
              if (pngBytes) [items[0] setData:pngBytes forType:NSPasteboardTypePNG];
              if (tiff) [items[0] setData:tiff forType:NSPasteboardTypeTIFF];
            }
          }
          CFRelease(source);
        }
      }
      if (request[@"expected"] && [request[@"expected"] integerValue] != board.changeCount) return 4;
      [board clearContents];
      if (![board writeObjects:items]) return 3;
    } else if ([action isEqual:@"inspect"] && isolated) {
      NSArray<NSURL *> *urls = [board readObjectsForClasses:@[NSURL.class]
          options:@{NSPasteboardURLReadingFileURLsOnlyKey:@YES}];
      NSMutableArray *names = [NSMutableArray array];
      for (NSURL *url in urls) [names addObject:url.path];
      response[@"paths"] = names;
      NSMutableArray *types = [NSMutableArray array];
      for (NSPasteboardItem *item in board.pasteboardItems)
        [types addObject:[item.types valueForKey:@"description"]];
      response[@"types"] = types;
      NSImage *image = [[NSImage alloc] initWithPasteboard:board];
      if (image) {
        NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];
        if (bitmap) response[@"imageSize"] = @[@(bitmap.pixelsWide), @(bitmap.pixelsHigh)];
      }
      NSData *png = [board dataForType:NSPasteboardTypePNG];
      if (png) response[@"png"] = [png base64EncodedStringWithOptions:0];
    } else if ([action isEqual:@"release"] && isolated) {
      [board releaseGlobally];
    } else if (![action isEqual:@"state"]) {
      return 2;
    }
    response[@"changeCount"] = @(board.changeCount);
    NSData *json = [NSJSONSerialization dataWithJSONObject:response options:0 error:nil];
    [NSFileHandle.fileHandleWithStandardOutput writeData:json];
  }
  return 0;
}
