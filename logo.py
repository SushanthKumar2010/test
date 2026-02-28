
import time
from google import genai
from google.genai import types

# 1. Initialize Client
# I've used your functional key here
client = genai.Client(api_key='AIzaSyAbT-9AZK9qFWnGzKifJXa_SPkGoAMQ2bI')

# 2. Upload the Logo 
# Note: 'file' is the correct parameter for the path to your image
print("Uploading logo...")
logo_file = client.files.upload(file="C:\\Users\\ASHOK\\Downloads\\teengro-clone-1-main (3)\\teengro-clone-1-main\\person.jpeg")

# 3. Generate the Animation using Veo 3.1
# 3. Generate the Animation
print("AI is starting the animation process...")
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="make the women walk into a indian muslim marriage (her face should be clearly visible) and then the video should end with a close up of her face with a smile. The video should be cinematic and professional. STRICTLY DONT ADD ANY MAKEUP TO HER FACE AND LET HER FACE BE CLEARLY VISIBLE THROUGHOUT THE VIDEO. her age should be as it is in the image. The video should be 8 seconds long.",
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        # '1:1' is not supported by Veo, so we use '16:9'
        aspect_ratio="9:16" 
    )
)

# 4. Wait for generation (Veo takes about 60-90 seconds)
while not operation.done:
    print("AI is still working... (checking every 10s)")
    time.sleep(10)
    operation = client.operations.get(operation)

# 5. Download the Result
# 5. Download the Result
if operation.response:
    generated_video = operation.response.generated_videos[0]
    print("\nAI generation complete. Downloading video...")
    
    # Download the bytes
    video_bytes = client.files.download(file=generated_video.video)
    
    # Save the bytes to a local file
    with open("teengro_animated.mp4", "wb") as f:
        f.write(video_bytes)
        
    print("✅ Success! Your video is saved as: teengro_animated.mp4")
else:
    print("\n❌ Generation failed. Check your API quota or safety settings.")