This directory contains the shadcn/ui component library

- Do not add non-shadcn/ui components to this directory. If you need to add components, please add them directly under the `components` directory. This helps with future component upgrades.
- Please maintain a changelog for any modifications to components to facilitate migration during future shadcn/ui upgrades.

## Changelogs

### DropdownMenuContent

Added a container property to specify the container for `DropdownMenuContent`. By default, it mounts to document.body.

```diff
 const DropdownMenuContent = React.forwardRef<
   React.ElementRef<typeof DropdownMenuPrimitive.Content>,
-  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
->(({ className, sideOffset = 4, ...props }, ref) => (
-  <DropdownMenuPrimitive.Portal>
+  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
+    container?: HTMLElement
+  }
+>(({ className, sideOffset = 4, container, ...props }, ref) => (
+  <DropdownMenuPrimitive.Portal
+    {...(container ? { container: container } : {})}
+  >
     <DropdownMenuPrimitive.Content
       ref={ref}
       sideOffset={sideOffset}
```

### PopoverContent

Added a container property to specify the container for `PopoverContent`. By default, it mounts to document.body.

```diff
 const PopoverContent = React.forwardRef<
   React.ElementRef<typeof PopoverPrimitive.Content>,
-  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
->(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
-  <PopoverPrimitive.Portal>
+  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
+    container?: HTMLElement
+  }
+>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => (
+  <PopoverPrimitive.Portal
+    {...(container ? { container: container } : {})}
+  >
     <PopoverPrimitive.Content
       ref={ref}
       align={align}
```

### DialogContent

Added a container property to specify the container for `DialogContent`. By default, it mounts to document.body.

```diff

 const DialogContent = React.forwardRef<
   React.ElementRef<typeof DialogPrimitive.Content>,
-  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
->(({ className, children, ...props }, ref) => (
-  <DialogPortal>
+  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
+    container?: HTMLElement
+  }
+>(({ className, children, container, ...props }, ref) => (
+  <DialogPrimitive.Portal {...(container ? { container } : {})}>
     <DialogOverlay />
     <DialogPrimitive.Content
       ref={ref}
@@ -48,7 +50,7 @@ const DialogContent = React.forwardRef<
         <span className="sr-only">Close</span>
       </DialogPrimitive.Close>
     </DialogPrimitive.Content>
-  </DialogPortal>
+  </DialogPrimitive.Portal>
 ))
 DialogContent.displayName = DialogPrimitive.Content.displayName
```
