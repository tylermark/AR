# Exporting GLB from Revit 2025 for ARFab

This guide explains how to convert a Revit 2025 model to GLB format for use with ARFab.

---

## Overview

ARFab uses the GLB format (binary glTF) for web-based 3D and AR viewing. **Revit does not export GLB or glTF natively.** You need to export to an intermediate format (FBX or IFC) and then convert to GLB using a free tool.

---

## Method 1: Revit → FBX → GLB (Recommended)

### Step 1: Prepare your Revit view

1. Open your Revit project and create or select a **3D view** containing only the elements you want to export.
   - Use a **Section Box** to isolate the relevant portion (e.g., a single assembly, mechanical unit, or prefab element).
   - Hide categories you don't need (annotations, topography, grids, levels).
   - **Purge unused families**: Manage > Purge Unused — this reduces geometry overhead.

2. Set the **Visual Style** to Shaded or Realistic (this determines how materials export).

### Step 2: Export to FBX

1. Go to **File > Export > FBX**.
2. In the export dialog:
   - Select the 3D view you prepared.
   - Leave default settings (Revit exports geometry + materials).
3. Save the `.fbx` file.

### Step 3: Convert FBX to GLB

Use one of these free tools:

**Option A: Blender (free, offline)**

1. Download and install [Blender](https://www.blender.org/download/) (free, open source).
2. Open Blender. Go to **File > Import > FBX (.fbx)**.
3. Select your exported FBX file.
4. Review the model — delete unnecessary objects, fix scale if needed.
5. Go to **File > Export > glTF 2.0 (.glb/.gltf)**.
6. In the export settings:
   - **Format**: GLB (binary)
   - **Apply Modifiers**: enabled
   - **Compression**: enable Draco compression for smaller files
7. Save the `.glb` file and upload to ARFab.

**Option B: FBX2glTF (free CLI tool)**

1. Download [FBX2glTF](https://github.com/facebookincubator/FBX2glTF/releases) from GitHub.
2. Run from the command line:
   ```bash
   FBX2glTF --binary --draco --input model.fbx --output model.glb
   ```
3. Upload the `.glb` file to ARFab.

**Option C: Babylon.js Sandbox (free, browser-based, no install)**

1. Go to [sandbox.babylonjs.com](https://sandbox.babylonjs.com/)
2. Drag and drop your `.fbx` file into the browser window.
3. Verify the model looks correct.
4. Click the download icon and select **GLB** format.
5. Upload to ARFab.

---

## Method 2: Revit → IFC → GLB

IFC is an open BIM format that preserves more construction metadata than FBX.

### Step 1: Export to IFC

1. In Revit, go to **File > Export > IFC**.
2. Select **IFC4** format.
3. Choose the 3D view with your Section Box applied.
4. Save the `.ifc` file.

### Step 2: Convert IFC to GLB

**Using Blender with the BlenderBIM Add-on:**

1. Install [Blender](https://www.blender.org/download/) and the free [BlenderBIM Add-on](https://blenderbim.org/).
2. In Blender: **File > Import > IFC (.ifc)**.
3. Review and clean up the model.
4. **File > Export > glTF 2.0 (.glb/.gltf)** with GLB binary format selected.

**Using IFC.js or online converters:**

- [IFC to GLB Converter](https://ifcjs.github.io/web-ifc-viewer/) — browser-based, drag and drop.

---

## Method 3: Autodesk Platform Services (APS) Model Derivative API

For automated pipelines or if you convert many models:

1. Upload the Revit (.rvt) file directly to Autodesk Platform Services (formerly Forge).
2. Use the **Model Derivative API** to translate to glTF/GLB.
3. Download the GLB output.
4. Requires a free Autodesk Platform Services account.

See [APS documentation](https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/overview/) for setup instructions.

---

## Recommended Settings for Mobile AR

Mobile devices have limited GPU and memory. Optimize your export:

| Setting | Target | Notes |
|---|---|---|
| File format | GLB | Single binary file, easiest to upload |
| Target file size | Under 20 MB | Files over 50 MB load very slowly on mobile |
| Polygon count | Under 500,000 triangles | Check in Blender: select all, look at face count in status bar |
| Textures | Disabled or 512x512 max | Flat material colors are usually fine for fabrication |
| Draco compression | Enabled | Reduces file size 60-90% with minimal quality loss |

### File size targets

- **Under 10 MB**: Excellent — loads fast on any connection
- **10–25 MB**: Acceptable — a few seconds on cellular
- **25–50 MB**: Marginal — simplify the model
- **Over 50 MB**: Too large — will cause poor user experience

---

## Reducing File Size in Revit (Before Export)

- **Section Box**: Export only the relevant portion, not the entire project.
- **Purge Unused**: Manage > Purge Unused to remove unused families and materials.
- **Simplify geometry**: Use generic families instead of detailed manufacturer families.
- **Hide non-essential categories**: Foundations, site elements, and annotations add file size with no AR value.
- **Export one assembly at a time**: A single prefab unit or mechanical assembly is better for AR than an entire floor.

---

## Post-Export Optimization

After converting to GLB, you can further compress with `gltf-pipeline`:

```bash
# Install
npm install -g gltf-pipeline

# Compress with Draco
gltf-pipeline -i model.glb -o model-compressed.glb --draco.compressionLevel 7
```

The `<model-viewer>` component in ARFab supports Draco-compressed files natively.

---

## Tips

- **Scale**: Revit works in feet or meters. The GLB should be in meters for correct AR scale. Blender lets you adjust scale on import/export.
- **Orientation**: Revit uses Z-up; GLB uses Y-up. Blender and FBX2glTF handle this conversion automatically.
- **Materials**: Revit materials export as flat colors via FBX. This is fine for fabrication — you don't need PBR textures.
- **Test before printing QR codes**: Upload to ARFab, scan the QR on both Android (Chrome) and iOS (Safari), and verify scale and orientation look correct.

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| Model doesn't appear in browser | Corrupt GLB | Validate in [Babylon.js Sandbox](https://sandbox.babylonjs.com/) |
| AR button missing | Unsupported browser | Use Android Chrome or iOS Safari |
| Model too small/large in AR | Unit mismatch | Adjust scale in Blender before GLB export |
| Model appears sideways | Axis convention | Rotate root node in Blender (X: -90°) |
| FBX export missing geometry | View filter issue | Make sure all elements are visible in the 3D view before FBX export |
| Textures missing | Not embedded | Use GLB format (embeds everything) and check "embed textures" in Blender |

---

## Resources

- [Blender Download](https://www.blender.org/download/)
- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF/releases)
- [Babylon.js Sandbox](https://sandbox.babylonjs.com/)
- [model-viewer docs](https://modelviewer.dev/docs/)
- [glTF 2.0 spec](https://www.khronos.org/gltf/)
- [gltf-pipeline](https://www.npmjs.com/package/gltf-pipeline)
- [Autodesk Platform Services](https://aps.autodesk.com/)
