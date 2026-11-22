#include <iostream>
#include <numeric>
#include <vector>

int main()
{
    std::vector<int> values{2, 3, 5, 7, 11};
    const auto total = std::accumulate(values.begin(), values.end(), 0);
    const auto average = static_cast<double>(total) / values.size();

    std::cout << "Values:";
    for (const int value : values) {
        std::cout << ' ' << value;
    }
    std::cout << "\nTotal: " << total << "\nAverage: " << average << '\n';
}
