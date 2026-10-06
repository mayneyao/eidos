#include <stdlib.h>
#include <stdbool.h>
char *eidos_ios_execute(const char *path, const char *method, const char *request);
void eidos_ios_free(char *value);
bool eidos_ios_cancellation(const char *identity, int action);
char *eidos_ios_transfer_progress(const char *identity);
