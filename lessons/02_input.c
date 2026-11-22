#include <stdio.h>

static int add(double left, double right, double *result)
{
    if (result == NULL) {
        return 0;
    }

    *result = left + right;
    return 1;
}

int main(void)
{
    double left = 0.0;
    double right = 0.0;
    double result = 0.0;

    printf("Enter two numbers: ");
    if (scanf("%lf %lf", &left, &right) != 2) {
        fprintf(stderr, "Please enter two valid numbers.\n");
        return 1;
    }

    if (!add(left, right, &result)) {
        fprintf(stderr, "Could not store the result.\n");
        return 1;
    }

    printf("Sum: %.2f\n", result);
    return 0;
}
