#include <stdio.h>

static void greet(const char *name)
{
    printf("Hello, %s!\n", name);
}

int main(void)
{
    greet("C programmer");
    return 0;
}
