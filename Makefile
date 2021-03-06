SHELL=/bin/bash

.PHONY: local setup import_menlo import_critiques aggregate_data init_data \
        prod_import prod_import_mongo html_snapshots sitemap deploy clean \
        test require_virtualenv_in_dev

local: require_virtualenv_in_dev
	./local_server.sh

install: os-install common-install ;

os-install:
	if [ `uname -s` = Linux ]; then ./linux-setup.sh; fi
	if [ `uname -s` = Darwin ]; then ./mac-setup.sh; fi

common-install:
	./setup.sh

# TODO(mack): Find better way to vary command based on prod/dev
# TODO(mack): Add command to clear cache directory:
# - Mac OS X: ~/Library/Caches/Ofi\ Labs/PhantomJS
# - Linux: Find out
html_snapshots:
	@if [ `whoami` = 'rmc' ]; then \
		PYTHONPATH=.. python html_snapshots/snapshot.py http://localhost:80; \
	else \
		PYTHONPATH=.. python html_snapshots/snapshot.py http://localhost:5000; \
	fi

lint: require_virtualenv_in_dev
	third_party/rmc_linter/runlint.py | tee /tmp/linterrors.txt

sitemap:
	rm -f server/static/sitemap.txt
	PYTHONPATH=.. python html_snapshots/sitemap.py https://uwflow.com > server/static/sitemap.txt
	curl www.google.com/webmasters/tools/ping?sitemap=https://uwflow.com/static/sitemap.txt

import_menlo: require_virtualenv_in_dev
	PYTHONPATH=.. python data/processor.py all

import_critiques: require_virtualenv_in_dev
	PYTHONPATH=.. python data/evals/import_critiques.py data/evals/output/results_testing.txt

aggregate_data: require_virtualenv_in_dev
	PYTHONPATH=.. python data/aggregator.py all

init_data: import_menlo aggregate_data

export_data:
	mongodump --db rmc

export_data_to_dropbox:
	ssh rmc 'mongodump --db rmc'
	rsync -avz rmc:~/dump ~/Dropbox/Flow/db/
	( cd ~/Dropbox/Flow/db/ && zip -r dump.zip dump -x "**.DS_Store" )

prod_import: prod_import_mongo aggregate_data

prod_import_mongo:
	@if [ `whoami` = 'rmc' ]; then \
		echo "You're in prod!!! Don't dump our data :("; \
	else \
		rsync -avz rmc:~/dump .; \
		mongorestore --drop dump; \
	fi

deploy_skiptest:
	@if [ `whoami` = 'rmc' ]; then \
		./deploy.sh; \
	else \
		cat deploy.sh | ssh rmc DEPLOYER=`whoami` sh; \
	fi

deploy: test deploy_skiptest

pip_install: require_virtualenv_in_dev
	pip install -r requirements.txt

require_virtualenv_in_dev:
	@if [[ `whoami` = 'rmc' || "${VIRTUAL_ENV}" = "${HOME}/.virtualenv/rmc" ]]; then \
		true; \
	else \
		echo "ERROR: You are not in the rmc virtualenv"; \
		echo "To activate, run:"; \
		echo ; \
		echo "   source ~/.virtualenv/rmc/bin/activate"; \
		echo ; \
		false; \
	fi

stats: require_virtualenv_in_dev
	PYTHONPATH=.. python analytics/stats.py

alltest: require_virtualenv_in_dev
	PYTHONPATH=.. nosetests

test: require_virtualenv_in_dev
	PYTHONPATH=.. nosetests -a '!slow'

clean:
	find . -name '*.pyc' -delete
	rm -rf server/static/css
