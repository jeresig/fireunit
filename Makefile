
all:
	zip -r fireunit-`cat install.rdf|grep em:version|sed "s/.*>\(.*\)<.*/\1/"`.xpi *

clean:
	rm -rf fireunit*.xpi
