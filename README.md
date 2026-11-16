# Footprint Check

Add your name and a photo, press Scan, and review where you show up online.

- `index.html` is the whole page.
- `api/scan-name.js` has Claude search the web for pages that mention the name and returns them as a list.
- `api/scan-face.js` sends the photo to the FaceCheck.ID face-search API and returns the matching pictures.

## Putting it online (Vercel)

1. Import this repository as a new project on vercel.com. No build settings are needed.
2. In the project's Settings, under Environment Variables, add:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com. Web search must be enabled for the organization there.
   - `FACECHECK_API_TOKEN`: from facecheck.id (API access is paid, per search). Without it the name scan still works and the face scan reports that it is not set up.
3. Deploy.

## Before opening it to the public

- Both routes spend your credits on every scan and have no sign-in or rate limit yet. Add one before sharing the link widely.
- The page asks people to confirm the name and photo are their own, but nothing verifies it. Face-recognition search of other people is restricted by law in several places (for example Illinois and the EU).
- `api/scan-face.js` was written from FaceCheck's published API and has not been run against the live service.
