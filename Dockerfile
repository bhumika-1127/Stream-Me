# Use Ubuntu 20.04 (Focal Fossa) as the base image
FROM ubuntu:focal

# Metadata
LABEL maintainer="bhumikaa275@gmail.com"
LABEL description="This Dockerfile builds an image with Node.js, FFmpeg, and nodemon for running a Node.js application."

# Install Node.js, npm, and FFmpeg
RUN apt-get update && \
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory to /app
WORKDIR /home/app/

# Install nodemon globally
RUN npm install -g nodemon

# Copy the backend files
COPY backend/ ./
RUN npm install

# Expose the port the app runs on
EXPOSE 4000

# Set the command to run the application with nodemon
CMD ["nodemon", "backend/index.js"]
