#include <iostream>

void add(double left, double right, double& result)
{
    result = left + right;
}

int main()
{
    double left = 0.0;
    double right = 0.0;
    double result = 0.0;

    std::cout << "Enter two numbers: ";
    if (!(std::cin >> left >> right)) {
        std::cerr << "Please enter two valid numbers.\n";
        return 1;
    }

    add(left, right, result);
    std::cout << "Sum: " << result << '\n';
}
