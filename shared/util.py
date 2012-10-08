from bson import json_util
import rmc.shared.constants as c
import math

def json_loads(json_str):
    return json_util.loads(json_str)

def json_dumps(obj):
    return json_util.dumps(obj).replace('</', '<\\/')

def dict_to_list(dikt):
    update_with_name = lambda key, val: dict(val, **{ 'name': key })
    return [update_with_name(k, v) for k, v in dikt.iteritems()]

def get_current_term_id():
    # FIXME[2013](Sandy): Don't hardcode this. Get the current term from the time
    # REMEMBER TO DO THIS BEFORE 2013_01
    return c.CURRENT_TERM_ID

# Ported Ruby's Statistics2.pnormaldist(qn) to Python
# http://stackoverflow.com/questions/6116770/whats-the-equivalent-of-rubys-pnormaldist-statistics-function-in-haskell
# inverse of normal distribution ([2])
# Pr( (-\infty, x] ) = qn -> x
def pnormaldist(qn):
    b = [1.570796288, 0.03706987906, -0.8364353589e-3,
        -0.2250947176e-3, 0.6841218299e-5, 0.5824238515e-5,
        -0.104527497e-5, 0.8360937017e-7, -0.3231081277e-8,
        0.3657763036e-10, 0.6936233982e-12]

    if qn < 0.0 or 1.0 < qn:
        logging.error("Error : qn <= 0 or qn >= 1  in pnorm()!")
        return 0.0;

    if qn == 0.5:
        return 0.0

    w1 = qn
    if qn > 0.5:
        w1 = 1.0 - w1
    w3 = -math.log(4.0 * w1 * (1.0 - w1))
    w1 = b[0]
    for i in range(1, 11):
        w1 += b[i] * w3**i;

    if qn > 0.5:
        return math.sqrt(w1 * w3)

    return -math.sqrt(w1 * w3)

# The lower bound on the proportion of positive ratings given the observed
# number of positive ratings (pos) and total ratings (n)
# http://evanmiller.org/how-not-to-sort-by-average-rating.html
def get_actual_rating_lower_bound(pos, n, confidence=c.RATINGS_CONFIDENCE):
    if n == 0:
        return 0

    z = pnormaldist(1-(1-confidence)/2)
    phat = 1.0*pos/n
    return (phat + z*z/(2*n) - z * math.sqrt((phat*(1-phat)+z*z/(4*n))/n))/(1+z*z/n)
