cmake_minimum_required(VERSION 3.4.1)

project(expograftenv)

# Set C++ standard
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add the native library
add_library(
    expograftenv
    SHARED
    ExpoGraftEnvModule.cpp
)

# Find Android log library
find_library(
    log-lib
    log
)

# Link libraries
target_link_libraries(
    expograftenv
    ${log-lib}
)

