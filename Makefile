CC := gcc
CXX := g++
CFLAGS := -std=c17 -Wall -Wextra -Wpedantic -Werror -g
CXXFLAGS := -std=c++20 -Wall -Wextra -Wpedantic -Werror -g
BUILD_DIR := build

C_SOURCES := $(wildcard lessons/*.c)
CPP_SOURCES := $(wildcard lessons/*.cpp)
C_PROGRAMS := $(patsubst lessons/%.c,$(BUILD_DIR)/%_c,$(C_SOURCES))
CPP_PROGRAMS := $(patsubst lessons/%.cpp,$(BUILD_DIR)/%_cpp,$(CPP_SOURCES))

.PHONY: all clean test

all: $(C_PROGRAMS) $(CPP_PROGRAMS)

$(BUILD_DIR):
	mkdir -p $@

$(BUILD_DIR)/%_c: lessons/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) $< -o $@

$(BUILD_DIR)/%_cpp: lessons/%.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) $< -o $@

test: all
	@test "$$($(BUILD_DIR)/01_hello_c)" = "Hello, C programmer!"
	@test "$$($(BUILD_DIR)/01_hello_cpp)" = "Hello, future C++ programmer!"
	@printf '2 3\n' | $(BUILD_DIR)/02_input_c | grep -q 'Sum: 5.00'
	@printf '2 3\n' | $(BUILD_DIR)/02_input_cpp | grep -q 'Sum: 5'
	@$(BUILD_DIR)/03_collection_c | grep -q 'Average: 5.6'
	@$(BUILD_DIR)/03_collection_cpp | grep -q 'Average: 5.6'
	@echo "All lessons passed."

clean:
	rm -rf $(BUILD_DIR)
