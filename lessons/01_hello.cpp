#include <iostream>
#include <string>

void greet(const std::string& name)
{
    std::cout << "Hello, " << name << "!\n";
}

int main()
{
    greet("future C++ programmer");
}
