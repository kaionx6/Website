#include <stddef.h>
#include <stdio.h>

static int sum(const int values[], size_t count)
{
    int total = 0;
    for (size_t index = 0; index < count; ++index) {
        total += values[index];
    }
    return total;
}

int main(void)
{
    const int values[] = {2, 3, 5, 7, 11};
    const size_t count = sizeof values / sizeof values[0];
    const int total = sum(values, count);

    printf("Total: %d\n", total);
    printf("Average: %.1f\n", (double)total / count);
    return 0;
}
